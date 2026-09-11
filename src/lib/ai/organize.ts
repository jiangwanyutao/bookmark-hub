import type { Bookmark, FolderOption } from '../bookmarks';
import { buildMessages, type Privacy } from './prompt';
import { parseNewFolders, parseSuggestions, type NewFolderSuggestion, type Suggestion } from './parse';
import { inBatches, type BatchOptions, type Complete } from './batches';

export { BATCH_SIZE, estimateRequests, type Complete } from './batches';

/** PRD §18：至少这么多相似书签才建议新建目录 */
export const MIN_NEW_FOLDER_SIZE = 5;
const HIGH_CONFIDENCE = 0.85;
const MEDIUM_CONFIDENCE = 0.6;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const confidenceLevel = (confidence: number): ConfidenceLevel =>
  confidence >= HIGH_CONFIDENCE ? 'high' : confidence >= MEDIUM_CONFIDENCE ? 'medium' : 'low';

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

/** 分批请求 AI 给出整理建议（放进现有目录，或新建子目录）。 */
export async function runOrganize(
  complete: Complete,
  { bookmarks, folders, privacy }: OrganizeInput,
  options: BatchOptions = {},
): Promise<OrganizeResult> {
  const folderPaths = folders.map((f) => f.path);
  const folderIds = new Map(folders.map((f) => [f.path, f.id]));
  const suggestions: Suggestion[] = [];
  const proposals: NewFolderSuggestion[] = [];

  const { failures, skipped } = await inBatches(
    bookmarks,
    privacy,
    async (batch) => {
      const refs = new Map(
        batch.map((e) => [e.item.ref, { bookmarkId: e.bookmark.id, currentFolderId: e.bookmark.ancestorIds.at(-1) }]),
      );
      const content = await complete(buildMessages(batch.map((e) => e.item), folderPaths));
      suggestions.push(...parseSuggestions(content, { refs, folders: folderIds }));
      proposals.push(...parseNewFolders(content, { refs, folders: folderIds }));
    },
    options,
  );

  return { suggestions, newFolders: groupNewFolders(proposals), failures, skipped };
}
