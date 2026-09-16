import type { TreeNode } from './bookmarks';
import type { CreateNode } from './history';

/**
 * 读浏览器导出的书签文件（NETSCAPE-Bookmark-file-1）。
 * Chrome / Edge / Firefox 的「导出书签」都是这个格式，各家细节略有出入，
 * 所以交给浏览器自己的 HTML 解析器，只按 H3=目录、A=书签取内容。
 */
export function parseBookmarkHtml(html: string): TreeNode[] {
  return readList(new DOMParser().parseFromString(html, 'text/html').querySelector('dl'), '0');
}

function readList(dl: Element | null, idPrefix: string): TreeNode[] {
  if (!dl) return [];
  const nodes: TreeNode[] = [];
  for (const dt of [...dl.children].filter((el) => el.tagName === 'DT')) {
    const id = `${idPrefix}-${nodes.length}`;
    const heading = dt.querySelector(':scope > h3');
    if (heading) {
      nodes.push({ id, title: heading.textContent ?? '', children: readList(dt.querySelector(':scope > dl'), id) });
      continue;
    }
    const anchor = dt.querySelector(':scope > a');
    const url = anchor?.getAttribute('href');
    // 只接受真正能打开的链接，跳过 place: 之类的浏览器内部条目
    if (anchor && url && /^https?:/i.test(url)) nodes.push({ id, title: anchor.textContent || url, url });
  }
  return nodes;
}

export interface ImportPlan {
  /** 要新建的整棵子树，交给一条 create 操作执行，可整体撤销 */
  node: CreateNode;
  /** 这次会新增的书签数 */
  newCount: number;
  /** 文件里已经收藏过的书签数 */
  existingCount: number;
}

interface PlanOptions {
  skipExisting: boolean;
  now?: Date;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const importFolderTitle = (d: Date) => `导入的书签 ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 对照现有书签算出要导入什么。跳过已有时，变空的目录一并去掉。 */
export function planImport(roots: TreeNode[], existingUrls: Set<string>, { skipExisting, now = new Date() }: PlanOptions): ImportPlan {
  let newCount = 0;
  let existingCount = 0;

  const convert = (nodes: TreeNode[]): CreateNode[] =>
    nodes.flatMap<CreateNode>((node) => {
      if (node.url) {
        const already = existingUrls.has(node.url);
        if (already) existingCount += 1;
        if (already && skipExisting) return [];
        newCount += 1;
        return [{ title: node.title, url: node.url }];
      }
      const children = convert(node.children ?? []);
      // 原本就是空目录的保留，因为跳过重复而变空的不要
      if (children.length === 0 && (node.children?.length ?? 0) > 0) return [];
      return [{ title: node.title, children }];
    });

  const children = convert(roots);
  return { node: { title: importFolderTitle(now), children }, newCount, existingCount };
}
