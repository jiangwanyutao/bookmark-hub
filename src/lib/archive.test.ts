// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { decodeHtml, extractArticle, saveArchive, listArchiveTexts, type Archive } from './archive';
import { openHubDB } from './db';

const encode = (s: string) => new TextEncoder().encode(s);
// 「中文」的 GBK 编码
const GBK_ZHONGWEN = [0xd6, 0xd0, 0xce, 0xc4];

describe('decodeHtml', () => {
  it('uses the charset from the Content-Type header', () => {
    const bytes = new Uint8Array([...encode('<p>'), ...GBK_ZHONGWEN]);
    expect(decodeHtml(bytes, 'text/html; charset=GBK')).toBe('<p>中文');
  });

  it('falls back to <meta charset> when the header has none', () => {
    const bytes = new Uint8Array([...encode('<meta charset="gb2312"><p>'), ...GBK_ZHONGWEN]);
    expect(decodeHtml(bytes, 'text/html')).toContain('中文');
  });

  it('reads http-equiv meta and defaults to UTF-8', () => {
    const bytes = new Uint8Array([...encode('<meta http-equiv="Content-Type" content="text/html; charset=gbk">'), ...GBK_ZHONGWEN]);
    expect(decodeHtml(bytes, '')).toContain('中文');
    expect(decodeHtml(encode('<p>中文</p>'), '')).toBe('<p>中文</p>');
  });

  it('ignores an unknown charset instead of throwing', () => {
    expect(decodeHtml(encode('<p>ok</p>'), 'text/html; charset=bogus-9')).toBe('<p>ok</p>');
  });
});

describe('extractArticle', () => {
  const paragraph = '这是一段足够长的正文内容，用来让可读性算法认出这是文章主体。'.repeat(20);
  const html = `<html><head><title>文章标题</title></head><body>
    <nav>导航 菜单</nav>
    <article><h1>文章标题</h1><p>${paragraph}</p><p><a href="/next">下一篇</a><img src="img/a.png"></p></article>
    <script>alert(1)</script></body></html>`;

  it('extracts title and plain text of the main content', () => {
    const article = extractArticle(html, 'https://example.com/posts/1');
    expect(article?.title).toBe('文章标题');
    expect(article?.text).toContain('足够长的正文内容');
    expect(article?.text).not.toContain('alert');
  });

  it('turns relative links and images into absolute ones', () => {
    const article = extractArticle(html, 'https://example.com/posts/1');
    expect(article?.content).toContain('https://example.com/next');
    expect(article?.content).toContain('https://example.com/posts/img/a.png');
  });

  it('returns null when the page has no readable content', () => {
    expect(extractArticle('<html><body></body></html>', 'https://example.com/')).toBeNull();
  });
});

describe('archive store', () => {
  it('saves by url and lists lowercase texts for search', async () => {
    const db = await openHubDB();
    const archive: Archive = { url: 'https://a.com/', title: 'A', content: '<p>Hello</p>', text: 'Hello World', archivedAt: 1 };
    await saveArchive(db, archive);
    await saveArchive(db, { ...archive, text: 'Hello Again', archivedAt: 2 });
    expect(await db.count('archives')).toBe(1);
    expect(await listArchiveTexts(db)).toEqual(new Map([['https://a.com/', 'hello again']]));
  });
});
