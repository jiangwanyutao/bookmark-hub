import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { buildBookmarkHtml, exportFileName } from './exportHtml';

const folder = (title: string, children: TreeNode[], id = title): TreeNode => ({ id, title, children });
const link = (title: string, url: string, dateAdded = 1700000000000): TreeNode => ({ id: url, title, url, dateAdded });

describe('buildBookmarkHtml', () => {
  it('starts with the header browsers expect when importing', () => {
    const html = buildBookmarkHtml([folder('书签栏', [link('MDN', 'https://developer.mozilla.org/')])]);

    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<DL><p>');
    expect(html.trimEnd().endsWith('</DL><p>')).toBe(true);
  });

  it('writes a folder as H3 and its bookmarks as nested A tags', () => {
    const html = buildBookmarkHtml([folder('书签栏', [folder('前端', [link('MDN', 'https://developer.mozilla.org/')])])]);

    expect(html).toContain('<H3>前端</H3>');
    expect(html).toContain('<A HREF="https://developer.mozilla.org/" ADD_DATE="1700000000">MDN</A>');
  });

  it('escapes characters that would break the markup', () => {
    const html = buildBookmarkHtml([folder('书签栏', [link('<b>标题</b> & "引号"', 'https://a.com/?x=1&y=2')])]);

    expect(html).toContain('&lt;b&gt;标题&lt;/b&gt; &amp; &quot;引号&quot;');
    expect(html).toContain('HREF="https://a.com/?x=1&amp;y=2"');
    expect(html).not.toContain('<b>标题');
  });

  it('keeps empty folders and skips nothing else', () => {
    const html = buildBookmarkHtml([folder('书签栏', [folder('空目录', []), link('A', 'https://a.com/')])]);

    expect(html).toContain('<H3>空目录</H3>');
    expect(html).toContain('>A</A>');
  });

  it('names the file with the given date', () => {
    expect(exportFileName(new Date('2026-09-16T14:30:00'))).toBe('书签备份-2026-09-16.html');
  });
});
