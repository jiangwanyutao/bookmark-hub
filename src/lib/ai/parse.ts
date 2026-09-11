import { PATH_SEPARATOR } from '../bookmarks';

export interface Suggestion {
  bookmarkId: string;
  folderId: string;
  folderPath: string;
  confidence: number;
  reason: string;
}

/** AI 建议把书签放进一个还不存在的子目录（父目录必须已存在）。 */
export interface NewFolderSuggestion {
  bookmarkId: string;
  parentId: string;
  parentPath: string;
  name: string;
  path: string;
  confidence: number;
  reason: string;
}

export interface ParseContext {
  /** 本批的短编号 → 书签 id 与当前所在目录 */
  refs: Map<string, { bookmarkId: string; currentFolderId: string | undefined }>;
  /** 目录路径 → 目录 id */
  folders: Map<string, string>;
}

const INVALID_JSON = 'AI 返回的内容不是有效的 JSON';
const MAX_FOLDER_NAME_LENGTH = 30;

// 模型可能写成「书签栏/开发」，按去掉斜杠两侧空格后比较
const normalizePath = (path: string) =>
  path
    .split('/')
    .map((part) => part.trim())
    .join(PATH_SEPARATOR);

// 容忍 ```json 代码块和前后说明文字：取第一个 { 到最后一个 }
function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(INVALID_JSON);
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error(INVALID_JSON);
  }
}

function readEntries(content: string): Record<string, unknown>[] {
  const data = extractJson(content) as { suggestions?: unknown } | null;
  if (!Array.isArray(data?.suggestions)) throw new Error(INVALID_JSON);
  return data.suggestions.filter((raw): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null);
}

const isConfidence = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;
const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

const foldersByPath = (folders: Map<string, string>) =>
  new Map([...folders].map(([path, id]) => [normalizePath(path), { path, id }]));

/**
 * 校验 AI 返回的建议：编号必须属于本批、目录必须已存在、置信度在 0～1、
 * 不能是书签当前所在的目录；同一书签只取第一条有效建议。
 */
export function parseSuggestions(content: string, ctx: ParseContext): Suggestion[] {
  const known = foldersByPath(ctx.folders);
  const seen = new Set<string>();
  const result: Suggestion[] = [];

  for (const { ref, folder, confidence, reason } of readEntries(content)) {
    if (typeof ref !== 'string' || typeof folder !== 'string' || !isConfidence(confidence)) continue;
    const target = ctx.refs.get(ref);
    const match = known.get(normalizePath(folder));
    if (!target || !match || seen.has(ref) || match.id === target.currentFolderId) continue;

    seen.add(ref);
    result.push({ bookmarkId: target.bookmarkId, folderId: match.id, folderPath: match.path, confidence, reason: textOf(reason) });
  }
  return result;
}

/**
 * 新目录建议：必须带 isNewFolder: true，目录尚不存在、父目录已存在，
 * 目录名非空且不超过 30 个字；同一书签只取第一条。
 */
export function parseNewFolders(content: string, ctx: ParseContext): NewFolderSuggestion[] {
  const known = foldersByPath(ctx.folders);
  const seen = new Set<string>();
  const result: NewFolderSuggestion[] = [];

  for (const { ref, folder, confidence, reason, isNewFolder } of readEntries(content)) {
    if (isNewFolder !== true || typeof ref !== 'string' || typeof folder !== 'string' || !isConfidence(confidence)) continue;
    const target = ctx.refs.get(ref);
    if (!target || seen.has(ref)) continue;

    const normalized = normalizePath(folder);
    const parts = normalized.split(PATH_SEPARATOR);
    const name = parts.at(-1) ?? '';
    const parent = known.get(parts.slice(0, -1).join(PATH_SEPARATOR));
    if (!name || name.length > MAX_FOLDER_NAME_LENGTH || known.has(normalized) || !parent) continue;

    seen.add(ref);
    result.push({
      bookmarkId: target.bookmarkId,
      parentId: parent.id,
      parentPath: parent.path,
      name,
      path: `${parent.path}${PATH_SEPARATOR}${name}`,
      confidence,
      reason: textOf(reason),
    });
  }
  return result;
}
