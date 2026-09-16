import type { TreeNode } from './bookmarks';

/**
 * 导出成浏览器通用的书签文件（NETSCAPE-Bookmark-file-1）。
 * Chrome / Edge / Firefox 的「导入书签」都认这个格式，备份出去还能导回来。
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]!);

// 这个格式里的时间是秒
const addDate = (node: TreeNode) => (node.dateAdded ? ` ADD_DATE="${Math.floor(node.dateAdded / 1000)}"` : '');

function renderNodes(nodes: TreeNode[], depth: number): string {
  const pad = '    '.repeat(depth);
  return nodes
    .map((node) => {
      if (node.url) return `${pad}<DT><A HREF="${escape(node.url)}"${addDate(node)}>${escape(node.title)}</A>\n`;
      return (
        `${pad}<DT><H3${addDate(node)}>${escape(node.title)}</H3>\n` +
        `${pad}<DL><p>\n${renderNodes(node.children ?? [], depth + 1)}${pad}</DL><p>\n`
      );
    })
    .join('');
}

export function buildBookmarkHtml(roots: TreeNode[]): string {
  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    '<TITLE>Bookmarks</TITLE>\n' +
    '<H1>Bookmarks</H1>\n' +
    '<DL><p>\n' +
    renderNodes(roots, 1) +
    '</DL><p>\n'
  );
}

/** 把内容交给浏览器下载。扩展页里用 Blob 即可，不需要 downloads 权限。 */
export function downloadFile(content: string, fileName: string, type = 'text/html;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const exportFileName = (date: Date) =>
  `书签备份-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}.html`;
