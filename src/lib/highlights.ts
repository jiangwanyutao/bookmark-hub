import type { IDBPDatabase } from 'idb';
import type { HubDB } from './db';

/** 阅读视图里的高亮和批注。按网址存，书签撤销恢复后 id 会变，网址不变。 */
export interface Highlight {
  id: string;
  url: string;
  text: string;
  note: string;
  createdAt: number;
}

export async function addHighlight(db: IDBPDatabase<HubDB>, { url, text }: { url: string; text: string }, now: number): Promise<Highlight> {
  const highlight = { id: crypto.randomUUID(), url, text, note: '', createdAt: now };
  await db.add('highlights', highlight);
  return highlight;
}

export async function listHighlights(db: IDBPDatabase<HubDB>, url: string): Promise<Highlight[]> {
  const list = await db.getAllFromIndex('highlights', 'url', url);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateNote(db: IDBPDatabase<HubDB>, id: string, note: string): Promise<void> {
  const highlight = await db.get('highlights', id);
  if (highlight) await db.put('highlights', { ...highlight, note: note.trim() });
}

export const deleteHighlight = (db: IDBPDatabase<HubDB>, id: string) => db.delete('highlights', id);

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

interface Piece {
  node: Text;
  start: number;
  end: number;
}

/** 找到 needle 在 root 文本里第一次出现的位置，按文本节点拆成若干段。空白一律按单个空格比较。 */
function locate(root: HTMLElement, needle: string): Piece[] | null {
  const chars: { node: Text; offset: number }[] = [];
  let flat = '';
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const isSpace = /\s/.test(node.data[offset]!);
      if (isSpace && flat.endsWith(' ')) continue;
      flat += isSpace ? ' ' : node.data[offset];
      chars.push({ node, offset });
    }
  }
  const at = flat.indexOf(needle);
  if (!needle || at < 0) return null;

  const pieces: Piece[] = [];
  for (const { node, offset } of chars.slice(at, at + needle.length)) {
    const last = pieces.at(-1);
    if (last?.node === node) last.end = offset + 1;
    else pieces.push({ node, start: offset, end: offset + 1 });
  }
  return pieces;
}

/**
 * 给正文 HTML 加上 <mark data-highlight-id>，返回新 HTML 和找到了的高亮 id。
 * ponytail: 只按文字定位第一次出现；同一句话在文中重复时总是标第一处，要精确再存前后文
 */
export function applyHighlights(html: string, highlights: Pick<Highlight, 'id' | 'text'>[]): { html: string; found: Set<string> } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const found = new Set<string>();
  // 每处理一个高亮都重新遍历，前一个高亮拆分出的节点才不会错位
  for (const { id, text } of highlights) {
    const pieces = locate(doc.body, normalize(text));
    if (!pieces) continue;
    found.add(id);
    for (const { node, start, end } of pieces) {
      // 段落之间的换行也会落在范围里，不用包
      if (!node.data.slice(start, end).trim()) continue;
      let target = node;
      if (start > 0) target = target.splitText(start);
      if (end - start < target.length) target.splitText(end - start);
      const mark = doc.createElement('mark');
      mark.dataset.highlightId = id;
      target.replaceWith(mark);
      mark.append(target);
    }
  }
  return { html: doc.body.innerHTML, found };
}
