/** 与 chrome.bookmarks.BookmarkTreeNode 结构兼容的最小子集，便于脱离浏览器测试。 */
export interface TreeNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  children?: TreeNode[];
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  domain: string;
  folderPath: string;
  ancestorIds: string[];
  dateAdded?: number;
  /** 标题、网址、目录路径的小写拼接，搜索用 */
  searchText: string;
}

export interface BookmarkIndex {
  bookmarks: Bookmark[];
  /** 用户自建目录数，不含根节点与浏览器内置目录（书签栏、其他书签等） */
  folderCount: number;
  /** 目录 id → 该目录及其子目录下的书签总数 */
  countByFolder: Map<string, number>;
}

export interface FolderOption {
  id: string;
  path: string;
}

export interface DomainCount {
  domain: string;
  count: number;
}

// depth 0 是无标题根节点，depth 1 是浏览器内置目录
const BUILTIN_FOLDER_DEPTH = 1;
export const PATH_SEPARATOR = ' / ';

export function getDomain(url: string): string {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function buildIndex(roots: TreeNode[]): BookmarkIndex {
  const bookmarks: Bookmark[] = [];
  const countByFolder = new Map<string, number>();
  let folderCount = 0;

  const walk = (node: TreeNode, depth: number, ancestors: TreeNode[]): number => {
    if (node.url !== undefined) {
      const folderPath = ancestors
        .map((a) => a.title)
        .filter(Boolean)
        .join(PATH_SEPARATOR);
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        domain: getDomain(node.url),
        folderPath,
        ancestorIds: ancestors.map((a) => a.id),
        dateAdded: node.dateAdded,
        searchText: `${node.title}\n${node.url}\n${folderPath}`.toLowerCase(),
      });
      return 1;
    }

    if (depth > BUILTIN_FOLDER_DEPTH) folderCount += 1;
    const path = [...ancestors, node];
    const count = (node.children ?? []).reduce((sum, child) => sum + walk(child, depth + 1, path), 0);
    countByFolder.set(node.id, count);
    return count;
  };

  roots.forEach((root) => walk(root, 0, []));
  return { bookmarks, folderCount, countByFolder };
}

/** 除根节点外的全部目录，按树的顺序排列，带完整路径，供「移动到」选择。 */
export function listFolders(roots: TreeNode[]): FolderOption[] {
  const result: FolderOption[] = [];
  const walk = (node: TreeNode, parentPath: string) => {
    for (const child of node.children ?? []) {
      if (child.url !== undefined) continue;
      const path = parentPath ? `${parentPath}${PATH_SEPARATOR}${child.title}` : child.title;
      result.push({ id: child.id, path });
      walk(child, path);
    }
  };
  roots.forEach((root) => walk(root, ''));
  return result;
}

export function topDomains(bookmarks: Bookmark[], limit: number): DomainCount[] {
  const counts = new Map<string, number>();
  for (const { domain } of bookmarks) {
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

/** 按空格拆词，每个词都要命中标题、网址或目录路径之一（不区分大小写）。 */
export function searchBookmarks(bookmarks: Bookmark[], query: string): Bookmark[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return bookmarks;
  return bookmarks.filter((b) => terms.every((t) => b.searchText.includes(t)));
}
