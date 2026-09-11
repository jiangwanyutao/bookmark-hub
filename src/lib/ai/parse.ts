export interface Suggestion {
  bookmarkId: string;
  folderId: string;
  folderPath: string;
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

// 模型可能写成「书签栏/开发」，按去掉斜杠两侧空格后比较
const normalizePath = (path: string) =>
  path
    .split('/')
    .map((part) => part.trim())
    .join(' / ');

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

/**
 * 校验 AI 返回的建议：编号必须属于本批、目录必须已存在、置信度在 0～1、
 * 不能是书签当前所在的目录；同一书签只取第一条有效建议。
 */
export function parseSuggestions(content: string, ctx: ParseContext): Suggestion[] {
  const data = extractJson(content) as { suggestions?: unknown } | null;
  if (!Array.isArray(data?.suggestions)) throw new Error(INVALID_JSON);

  const foldersByPath = new Map([...ctx.folders].map(([path, id]) => [normalizePath(path), { path, id }]));
  const seen = new Set<string>();
  const result: Suggestion[] = [];

  for (const raw of data.suggestions) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { ref, folder, confidence, reason } = raw as Record<string, unknown>;
    if (typeof ref !== 'string' || typeof folder !== 'string' || typeof confidence !== 'number') continue;
    if (!(confidence >= 0 && confidence <= 1)) continue;

    const target = ctx.refs.get(ref);
    const match = foldersByPath.get(normalizePath(folder));
    if (!target || !match || seen.has(ref) || match.id === target.currentFolderId) continue;

    seen.add(ref);
    result.push({
      bookmarkId: target.bookmarkId,
      folderId: match.id,
      folderPath: match.path,
      confidence,
      reason: typeof reason === 'string' ? reason : '',
    });
  }
  return result;
}
