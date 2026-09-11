import type { IDBPDatabase } from 'idb';
import type { Bookmark } from '../bookmarks';
import type { HubDB } from '../db';
import type { AiItem, ChatMessage, Privacy } from './prompt';
import { extractJson, INVALID_JSON } from './parse';
import { inBatches, type BatchOptions, type Complete } from './batches';

/** 按网址存：书签撤销恢复后 id 会变，网址不变。标签只是本机元数据，不改动浏览器书签。 */
export interface BookmarkTags {
  url: string;
  tags: string[];
  updatedAt: number;
}

export const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 20;

const SYSTEM_PROMPT = [
  '你为浏览器书签生成标签，方便以后搜索。',
  '- 每个书签 1～5 个简短标签，写主题、技术或用途，例如 "React"、"性能优化"、"教程"。',
  '- 标签用中文或通用的英文术语，不要写整句话。',
  '只输出 JSON，格式：{"tags":[{"ref":"b1","tags":["React","性能优化"]}]}',
].join('\n');

export function buildTagMessages(items: AiItem[]): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: ['待打标签的书签（每行一个 JSON）：', ...items.map((item) => JSON.stringify(item))].join('\n') },
  ];
}

/** 去掉首尾空格，丢掉空的、超过 20 字的和非字符串，不区分大小写去重，最多 5 个。AI 结果和手动输入都用它。 */
export function cleanTags(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const tag = value.trim();
    const key = tag.toLowerCase();
    if (!tag || tag.length > MAX_TAG_LENGTH || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length === MAX_TAGS) break;
  }
  return result;
}

/** 解析 AI 返回的标签；refs 为本批短编号 → 书签 id。 */
export function parseTags(content: string, refs: Map<string, string>): Map<string, string[]> {
  const data = extractJson(content) as { tags?: unknown } | null;
  if (!Array.isArray(data?.tags)) throw new Error(INVALID_JSON);

  const result = new Map<string, string[]>();
  for (const entry of data.tags) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { ref, tags } = entry as Record<string, unknown>;
    if (typeof ref !== 'string' || !Array.isArray(tags)) continue;
    const bookmarkId = refs.get(ref);
    if (!bookmarkId || result.has(bookmarkId)) continue;
    const cleaned = cleanTags(tags);
    if (cleaned.length > 0) result.set(bookmarkId, cleaned);
  }
  return result;
}

export interface TaggingResult {
  /** 书签 id → 标签 */
  tags: Map<string, string[]>;
  failures: string[];
  skipped: number;
}

export async function runTagging(
  complete: Complete,
  { bookmarks, privacy }: { bookmarks: Bookmark[]; privacy: Privacy },
  options: BatchOptions = {},
): Promise<TaggingResult> {
  const tags = new Map<string, string[]>();
  const { failures, skipped } = await inBatches(
    bookmarks,
    privacy,
    async (batch) => {
      const refs = new Map(batch.map((e) => [e.item.ref, e.bookmark.id]));
      const content = await complete(buildTagMessages(batch.map((e) => e.item)));
      for (const [bookmarkId, bookmarkTags] of parseTags(content, refs)) tags.set(bookmarkId, bookmarkTags);
    },
    options,
  );
  return { tags, failures, skipped };
}

/** 保存标签；空数组表示清除。 */
export async function saveTags(db: IDBPDatabase<HubDB>, entries: [url: string, tags: string[]][], now: number) {
  const tx = db.transaction('tags', 'readwrite');
  await Promise.all([
    ...entries.map(([url, tags]) => (tags.length > 0 ? tx.store.put({ url, tags, updatedAt: now }) : tx.store.delete(url))),
    tx.done,
  ]);
}
