import { describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../bookmarks';
import type { ChatMessage } from './prompt';
import { buildTagMessages, parseTags, runTagging } from './tags';

const refs = new Map([
  ['b1', '101'],
  ['b2', '102'],
]);

describe('parseTags', () => {
  it('trims, drops empty and overlong tags, dedupes case-insensitively and keeps at most 5', () => {
    const content = JSON.stringify({
      tags: [
        { ref: 'b1', tags: [' AI ', 'api', 'ai', '', 'x'.repeat(21), 'LLM', 'Docs', 'Tutorial', 'Extra'] },
        { ref: 'b9', tags: ['未知编号'] },
        { ref: 'b2', tags: '不是数组' },
      ],
    });
    expect(parseTags(content, refs)).toEqual(new Map([['101', ['AI', 'api', 'LLM', 'Docs', 'Tutorial']]]));
  });

  it('ignores non-string tags', () => {
    expect(parseTags(JSON.stringify({ tags: [{ ref: 'b1', tags: ['ok', 3, null] }] }), refs)).toEqual(
      new Map([['101', ['ok']]]),
    );
  });

  it('throws a readable error when the content is not usable JSON', () => {
    expect(() => parseTags('不行', refs)).toThrow('AI 返回的内容不是有效的 JSON');
    expect(() => parseTags('{"suggestions": []}', refs)).toThrow('AI 返回的内容不是有效的 JSON');
  });
});

describe('buildTagMessages', () => {
  it('sends the bookmarks as JSON lines', () => {
    const [system, user] = buildTagMessages([{ ref: 'b1', title: 'React 性能优化', domain: 'react.dev' }]);
    expect(system!.role).toBe('system');
    expect(user!.content).toContain('{"ref":"b1","title":"React 性能优化","domain":"react.dev"}');
  });
});

const bookmark = (i: number, url = `https://site${i}.com/`): Bookmark => ({
  id: `id${i}`,
  title: `书签 ${i}`,
  url,
  domain: new URL(url).hostname,
  folderPath: '其他书签',
  ancestorIds: ['0', '2'],
  searchText: '',
});

describe('runTagging', () => {
  it('tags every bookmark in batches of 50, skipping intranet ones', async () => {
    const complete = vi.fn(async (messages: ChatMessage[]) => {
      const batchRefs = [...messages[1]!.content.matchAll(/"ref":"(b\d+)"/g)].map((m) => m[1]!);
      return JSON.stringify({ tags: batchRefs.map((ref) => ({ ref, tags: [`标签${ref}`] })) });
    });
    const bookmarks = [...Array.from({ length: 60 }, (_, i) => bookmark(i + 1)), bookmark(61, 'http://localhost/')];

    const result = await runTagging(complete, { bookmarks, privacy: 'title_domain' });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.tags.size).toBe(60);
    expect(result.tags.get('id1')).toEqual(['标签b1']);
    expect(result.tags.get('id60')).toEqual(['标签b60']);
    expect(result.skipped).toBe(1);
    expect(result.failures).toEqual([]);
  });
});
