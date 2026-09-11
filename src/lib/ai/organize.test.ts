import { describe, expect, it, vi } from 'vitest';
import type { Bookmark, FolderOption } from '../bookmarks';
import type { ChatMessage } from './prompt';
import { runOrganize } from './organize';

const folders: FolderOption[] = [
  { id: '2', path: '其他书签' },
  { id: '10', path: '书签栏 / 开发' },
];

const bookmark = (i: number, url = `https://site${i}.com/`): Bookmark => ({
  id: `id${i}`,
  title: `书签 ${i}`,
  url,
  domain: new URL(url).hostname,
  folderPath: '其他书签',
  ancestorIds: ['0', '2'],
  searchText: '',
});

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** 假模型：把每批里的第一个书签建议移到「书签栏 / 开发」。 */
const firstOfBatch = vi.fn(async (messages: ChatMessage[]) => {
  const ref = /"ref":"(b\d+)"/.exec(messages[1]!.content)![1];
  return JSON.stringify({ suggestions: [{ ref, folder: '书签栏 / 开发', confidence: 0.9, reason: '开发' }] });
});

describe('runOrganize', () => {
  it('sends bookmarks in batches of 50 and maps every suggestion back to its bookmark', async () => {
    firstOfBatch.mockClear();
    const progress: [number, number][] = [];

    const result = await runOrganize(firstOfBatch, { bookmarks: range(120).map((i) => bookmark(i)), folders, privacy: 'title_domain' }, {
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(firstOfBatch).toHaveBeenCalledTimes(3);
    expect(result.suggestions.map((s) => s.bookmarkId)).toEqual(['id1', 'id51', 'id101']);
    expect(result.failures).toEqual([]);
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it('keeps other batches when one request fails', async () => {
    let call = 0;
    const flaky = async (messages: ChatMessage[]) => {
      call += 1;
      if (call === 2) throw new Error('429 请求太频繁');
      return firstOfBatch(messages);
    };

    const result = await runOrganize(flaky, { bookmarks: range(120).map((i) => bookmark(i)), folders, privacy: 'title' });

    expect(result.suggestions).toHaveLength(2);
    expect(result.failures).toEqual(['429 请求太频繁']);
  });

  it('skips intranet bookmarks and reports how many', async () => {
    const result = await runOrganize(firstOfBatch, {
      bookmarks: [bookmark(1), bookmark(2, 'http://localhost:3000/')],
      folders,
      privacy: 'title',
    });
    expect(result.skipped).toBe(1);
    expect(result.suggestions.map((s) => s.bookmarkId)).toEqual(['id1']);
  });

  it('stops sending new batches once aborted', async () => {
    const controller = new AbortController();
    const complete = vi.fn(async (messages: ChatMessage[]) => {
      controller.abort();
      return firstOfBatch(messages);
    });

    await runOrganize(complete, { bookmarks: range(120).map((i) => bookmark(i)), folders, privacy: 'title' }, { signal: controller.signal });

    expect(complete).toHaveBeenCalledTimes(1);
  });
});
