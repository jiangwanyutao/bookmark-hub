import type { Bookmark } from '../bookmarks';
import { toAiItem, type AiItem, type ChatMessage, type Privacy } from './prompt';

export const BATCH_SIZE = 50;

export const estimateRequests = (bookmarkCount: number) => Math.ceil(bookmarkCount / BATCH_SIZE);

/** 发送一次对话、返回模型回复文本；测试时换成假实现。 */
export type Complete = (messages: ChatMessage[]) => Promise<string>;

export interface BatchEntry {
  bookmark: Bookmark;
  item: AiItem;
}

export interface BatchOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

const chunk = <T>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/**
 * 按隐私等级把书签转成发给 AI 的条目（内网书签跳过），每 50 条调用一次 handle。
 * 某一批失败只记录错误、不影响其他批次；中止后不再开始新批次。
 */
export async function inBatches(
  bookmarks: Bookmark[],
  privacy: Privacy,
  handle: (batch: BatchEntry[]) => Promise<void>,
  { signal, onProgress }: BatchOptions = {},
): Promise<{ failures: string[]; skipped: number }> {
  const entries: BatchEntry[] = [];
  bookmarks.forEach((bookmark, i) => {
    const item = toAiItem(`b${i + 1}`, bookmark, privacy);
    if (item) entries.push({ bookmark, item });
  });

  const batches = chunk(entries, BATCH_SIZE);
  const failures: string[] = [];
  for (const [i, batch] of batches.entries()) {
    if (signal?.aborted) break;
    try {
      await handle(batch);
    } catch (e) {
      if (signal?.aborted) break;
      failures.push(e instanceof Error ? e.message : String(e));
    }
    onProgress?.(i + 1, batches.length);
  }
  return { failures, skipped: bookmarks.length - entries.length };
}
