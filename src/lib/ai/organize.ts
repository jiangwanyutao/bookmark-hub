import type { Bookmark, FolderOption } from '../bookmarks';
import { buildMessages, toAiItem, type AiItem, type ChatMessage, type Privacy } from './prompt';
import { parseNewFolders, parseSuggestions, type NewFolderSuggestion, type Suggestion } from './parse';

export const BATCH_SIZE = 50;
/** PRD §18：至少这么多相似书签才建议新建目录 */
export const MIN_NEW_FOLDER_SIZE = 5;
const HIGH_CONFIDENCE = 0.85;
const MEDIUM_CONFIDENCE = 0.6;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const confidenceLevel = (confidence: number): ConfidenceLevel =>
  confidence >= HIGH_CONFIDENCE ? 'high' : confidence >= MEDIUM_CONFIDENCE ? 'medium' : 'low';

export const estimateRequests = (bookmarkCount: number) => Math.ceil(bookmarkCount / BATCH_SIZE);

export interface OrganizeInput {
  bookmarks: Bookmark[];
  folders: FolderOption[];
  privacy: Privacy;
}

export interface NewFolderGroup {
  path: string;
  parentId: string;
  name: string;
  reason: string;
  bookmarkIds: string[];
}

export interface OrganizeResult {
  suggestions: Suggestion[];
  /** 跨批次合并后、书签数达到 MIN_NEW_FOLDER_SIZE 的新目录建议 */
  newFolders: NewFolderGroup[];
  /** 每个失败批次的错误说明；其他批次的建议照常保留 */
  failures: string[];
  /** 没有发送给 AI 的书签数（内网） */
  skipped: number;
}

/** 发送一次对话、返回模型回复文本；测试时换成假实现。 */
export type Complete = (messages: ChatMessage[]) => Promise<string>;

interface Entry {
  bookmark: Bookmark;
  item: AiItem;
}

const chunk = <T>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function groupNewFolders(proposals: NewFolderSuggestion[]): NewFolderGroup[] {
  const byPath = new Map<string, NewFolderGroup>();
  for (const p of proposals) {
    const group = byPath.get(p.path);
    if (group) group.bookmarkIds.push(p.bookmarkId);
    else byPath.set(p.path, { path: p.path, parentId: p.parentId, name: p.name, reason: p.reason, bookmarkIds: [p.bookmarkId] });
  }
  return [...byPath.values()]
    .filter((g) => g.bookmarkIds.length >= MIN_NEW_FOLDER_SIZE)
    .sort((a, b) => b.bookmarkIds.length - a.bookmarkIds.length);
}

/** 分批请求 AI 给出整理建议。某一批失败只记录错误，不影响其他批次；中止后不再发新批次。 */
export async function runOrganize(
  complete: Complete,
  { bookmarks, folders, privacy }: OrganizeInput,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<OrganizeResult> {
  const entries: Entry[] = [];
  bookmarks.forEach((bookmark, i) => {
    const item = toAiItem(`b${i + 1}`, bookmark, privacy);
    if (item) entries.push({ bookmark, item });
  });

  const folderPaths = folders.map((f) => f.path);
  const folderIds = new Map(folders.map((f) => [f.path, f.id]));
  const batches = chunk(entries, BATCH_SIZE);
  const suggestions: Suggestion[] = [];
  const proposals: NewFolderSuggestion[] = [];
  const failures: string[] = [];

  for (const [i, batch] of batches.entries()) {
    if (signal?.aborted) break;
    const refs = new Map(
      batch.map((e) => [e.item.ref, { bookmarkId: e.bookmark.id, currentFolderId: e.bookmark.ancestorIds.at(-1) }]),
    );
    try {
      const content = await complete(buildMessages(batch.map((e) => e.item), folderPaths));
      suggestions.push(...parseSuggestions(content, { refs, folders: folderIds }));
      proposals.push(...parseNewFolders(content, { refs, folders: folderIds }));
    } catch (e) {
      if (signal?.aborted) break;
      failures.push(e instanceof Error ? e.message : String(e));
    }
    onProgress?.(i + 1, batches.length);
  }

  return { suggestions, newFolders: groupNewFolders(proposals), failures, skipped: bookmarks.length - entries.length };
}
