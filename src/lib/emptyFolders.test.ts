import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { findEmptyFolders } from './emptyFolders';

const folder = (id: string, title: string, children: TreeNode[]): TreeNode => ({ id, title, children });
const link = (id: string, url: string): TreeNode => ({ id, title: id, url });

// browser.bookmarks.getTree() 返回的是一个虚拟根，下面才是书签栏和其他书签。
// 这两个根目录浏览器不允许删，空着也不能列出来。
const roots = (...children: TreeNode[]) => [
  { id: '0', title: '', children: [folder('1', '书签栏', children), folder('2', '其他书签', [])] },
];

describe('findEmptyFolders', () => {
  it('finds a folder with nothing in it', () => {
    const found = findEmptyFolders(roots(folder('10', '空目录', []), folder('11', '有书签', [link('a', 'https://a.com/')])));

    expect(found.map((f) => f.id)).toEqual(['10']);
  });

  it('treats a folder holding only empty folders as empty, and reports just the outermost one', () => {
    const found = findEmptyFolders(roots(folder('10', '外层', [folder('11', '里层', []), folder('12', '里层2', [])])));

    expect(found.map((f) => f.id)).toEqual(['10']);
  });

  it('keeps a folder that has a bookmark anywhere below it', () => {
    const found = findEmptyFolders(roots(folder('10', '外层', [folder('11', '里层', [link('a', 'https://a.com/')])])));

    expect(found).toEqual([]);
  });

  it('never reports the browser roots themselves', () => {
    expect(findEmptyFolders(roots())).toEqual([]);
  });

  it('reports the path so the user can tell folders with the same name apart', () => {
    // 「工作」自己有书签，所以要报的是它下面那个空的「归档」
    const found = findEmptyFolders(roots(folder('10', '工作', [link('a', 'https://a.com/'), folder('11', '归档', [])])));

    expect(found[0]).toMatchObject({ id: '11', title: '归档', path: '书签栏 / 工作' });
  });

  it('counts how many folders disappear when an outer empty folder is removed', () => {
    const found = findEmptyFolders(roots(folder('10', '外层', [folder('11', '里层', []), folder('12', '里层2', [])])));

    expect(found[0]?.folderCount).toBe(3);
  });
});
