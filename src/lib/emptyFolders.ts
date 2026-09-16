import { PATH_SEPARATOR, type TreeNode } from './bookmarks';

export interface EmptyFolder {
  id: string;
  title: string;
  /** 所在位置，例如「书签栏 / 工作」 */
  path: string;
  /** 删掉这一条会连带消失的目录数，含它自己 */
  folderCount: number;
}

const isFolder = (node: TreeNode) => node.url === undefined;

const countFolders = (node: TreeNode): number =>
  1 + (node.children ?? []).filter(isFolder).reduce((sum, child) => sum + countFolders(child), 0);

const hasBookmark = (node: TreeNode): boolean =>
  (node.children ?? []).some((child) => (child.url !== undefined ? true : hasBookmark(child)));

/**
 * 找出一个书签都没有的目录（只装着空目录的也算）。
 * 只返回最外层的那个，删它就会连里面的空目录一起没了。
 *
 * 参数是 browser.bookmarks.getTree() 的返回值：外面套着一个虚拟根，
 * 它的直接子节点是书签栏、其他书签这些浏览器根目录 —— 它们删不掉，空着也不列出来。
 */
export function findEmptyFolders(roots: TreeNode[]): EmptyFolder[] {
  const found: EmptyFolder[] = [];

  const walk = (node: TreeNode, ancestors: string[]) => {
    for (const child of (node.children ?? []).filter(isFolder)) {
      if (!hasBookmark(child)) {
        found.push({ id: child.id, title: child.title, path: ancestors.join(PATH_SEPARATOR), folderCount: countFolders(child) });
        continue; // 里面的空目录跟着父目录一起删，不重复列出
      }
      walk(child, [...ancestors, child.title]);
    }
  };

  for (const virtualRoot of roots) {
    for (const browserRoot of (virtualRoot.children ?? []).filter(isFolder)) walk(browserRoot, [browserRoot.title]);
  }
  return found;
}
