import { PATH_SEPARATOR, type TreeNode } from './bookmarks';

export interface TileItem {
  id: string;
  title: string;
  url: string;
}

/** 分类里的一组图标；title 为 null 表示目录里直接放的书签。 */
export interface TileSection {
  title: string | null;
  items: TileItem[];
}

export interface Category {
  id: string;
  name: string;
  count: number;
  sections: TileSection[];
}

const PINNED_ID = 'pinned';
const PINNED_NAME = '常用';

const isFolder = (node: TreeNode) => node.url === undefined;
const toItem = (node: TreeNode): TileItem => ({ id: node.id, title: node.title, url: node.url! });
const looseOf = (folder: TreeNode) => (folder.children ?? []).filter((c) => !isFolder(c)).map(toItem);

/** 目录里直接放的书签在前；各级子目录按树的顺序各成一组，标题是相对路径（如「AI / LLM」）。 */
function folderSections(folder: TreeNode): TileSection[] {
  const sections: TileSection[] = [];
  const walk = (node: TreeNode, title: string | null) => {
    const items = looseOf(node);
    if (items.length > 0) sections.push({ title, items });
    for (const child of (node.children ?? []).filter(isFolder)) {
      walk(child, title ? `${title}${PATH_SEPARATOR}${child.title}` : child.title);
    }
  };
  walk(folder, null);
  return sections;
}

/**
 * 书签导航的分类：书签栏里的零散书签为「常用」，内置目录下的第一层目录各为一类，
 * 其他内置目录里的零散书签以该内置目录命名。没有书签的分类不显示。
 */
export function categorize(roots: TreeNode[]): Category[] {
  const [bar, ...otherBuiltins] = roots[0]?.children ?? [];
  if (!bar) return [];

  const categories: Category[] = [];
  const add = (id: string, name: string, sections: TileSection[]) => {
    const count = sections.reduce((sum, s) => sum + s.items.length, 0);
    if (count > 0) categories.push({ id, name, count, sections });
  };
  const addFolders = (builtin: TreeNode) => {
    for (const folder of (builtin.children ?? []).filter(isFolder)) add(folder.id, folder.title, folderSections(folder));
  };

  add(PINNED_ID, PINNED_NAME, [{ title: null, items: looseOf(bar) }]);
  addFolders(bar);
  for (const builtin of otherBuiltins) {
    addFolders(builtin);
    add(builtin.id, builtin.title, [{ title: null, items: looseOf(builtin) }]);
  }
  return categories;
}

/** 分类里各二级目录名（section 标题首段），按出现顺序去重；无子目录时为空。 */
export function subfolderTabs(sections: TileSection[]): string[] {
  const tabs: string[] = [];
  for (const s of sections) {
    if (!s.title) continue;
    const tab = s.title.split(PATH_SEPARATOR)[0]!;
    if (!tabs.includes(tab)) tabs.push(tab);
  }
  return tabs;
}

/** tab 为 null（全部）时原样返回；否则只保留标题首段等于 tab 的分组。 */
export function sectionsForTab(sections: TileSection[], tab: string | null): TileSection[] {
  if (tab === null) return sections;
  return sections.filter((s) => s.title?.split(PATH_SEPARATOR)[0] === tab);
}

const LOCAL_HOST = /^localhost(:\d+)?$/i;
const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/;
// 顶级域名至少两个字母，避免把「a.b」这类当成网址
const DOMAIN_HOST = /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?$/i;

/** 输入像网址时返回可打开的地址（补全协议），否则返回 null 表示按搜索处理。 */
export function toNavigableUrl(input: string): string | null {
  const q = input.trim();
  if (!q || /\s/.test(q)) return null;
  if (/^https?:\/\//i.test(q)) {
    try {
      new URL(q);
      return q;
    } catch {
      return null;
    }
  }
  const host = q.split(/[/?#]/)[0]!;
  if (LOCAL_HOST.test(host) || IPV4_HOST.test(host)) return `http://${q}`;
  if (DOMAIN_HOST.test(host)) return `https://${q}`;
  return null;
}
