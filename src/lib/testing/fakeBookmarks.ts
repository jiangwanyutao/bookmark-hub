import type { TreeNode } from '../bookmarks';
import type { BookmarksApi } from '../history';

interface Stored {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded: number;
  children: string[];
}

/**
 * 内存版 chrome.bookmarks，行为对齐浏览器：
 * get / getChildren 不带 children，getSubTree / getTree 带；
 * 找不到 id、非空目录用 remove、index 越界都会抛错。
 */
export function createFakeBookmarks(): BookmarksApi {
  const nodes = new Map<string, Stored>();
  let nextId = 100;
  let clock = 1_000;

  const must = (id: string) => {
    const n = nodes.get(id);
    if (!n) throw new Error(`Can't find bookmark for id. ${id}`);
    return n;
  };
  const indexOf = (n: Stored) => (n.parentId ? must(n.parentId).children.indexOf(n.id) : 0);
  const toNode = (n: Stored, deep: boolean): TreeNode => ({
    id: n.id,
    parentId: n.parentId,
    index: indexOf(n),
    title: n.title,
    url: n.url,
    dateAdded: n.dateAdded,
    ...(n.url === undefined && deep ? { children: n.children.map((c) => toNode(must(c), true)) } : {}),
  });
  const insert = (parentId: string, id: string, index?: number) => {
    const p = must(parentId);
    const i = index ?? p.children.length;
    if (i > p.children.length) throw new Error('Index out of bounds.');
    p.children = [...p.children.slice(0, i), id, ...p.children.slice(i)];
  };
  const detach = (n: Stored) => {
    const p = must(n.parentId!);
    p.children = p.children.filter((c) => c !== n.id);
  };
  const removeDeep = (id: string) => {
    must(id).children.forEach(removeDeep);
    nodes.delete(id);
  };

  nodes.set('0', { id: '0', title: '', dateAdded: 0, children: ['1', '2'] });
  nodes.set('1', { id: '1', parentId: '0', title: '书签栏', dateAdded: 0, children: [] });
  nodes.set('2', { id: '2', parentId: '0', title: '其他书签', dateAdded: 0, children: [] });

  return {
    getTree: async () => [toNode(must('0'), true)],
    getSubTree: async (id) => [toNode(must(id), true)],
    get: async (id) => [toNode(must(id), false)],
    getChildren: async (id) => must(id).children.map((c) => toNode(must(c), false)),
    create: async ({ parentId = '2', index, title = '', url }) => {
      const id = String(nextId++);
      insert(parentId, id, index);
      nodes.set(id, { id, parentId, title, url, dateAdded: clock++, children: [] });
      return toNode(must(id), false);
    },
    move: async (id, { parentId, index }) => {
      const n = must(id);
      const target = parentId ?? n.parentId!;
      must(target);
      detach(n);
      n.parentId = target;
      insert(target, id, index);
      return toNode(n, false);
    },
    update: async (id, { title, url }) => {
      const n = must(id);
      if (title !== undefined) n.title = title;
      if (url !== undefined) n.url = url;
      return toNode(n, false);
    },
    remove: async (id) => {
      const n = must(id);
      if (n.children.length > 0) throw new Error("Can't remove non-empty folder.");
      detach(n);
      nodes.delete(id);
    },
    removeTree: async (id) => {
      detach(must(id));
      removeDeep(id);
    },
  };
}
