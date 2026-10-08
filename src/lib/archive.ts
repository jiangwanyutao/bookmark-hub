import type { IDBPDatabase } from 'idb';
import { Readability } from '@mozilla/readability';
import type { HubDB } from './db';
import { requestPermissions } from './permissions';

/**
 * 网页存档：下载网页 HTML，用 Readability 提取正文后存在本机，链接失效后还能读。
 * 按网址存：书签撤销恢复后 id 会变，网址不变。
 * ponytail: 只存正文，不存图片、样式和脚本渲染出的内容；要完整副本再考虑 pageCapture 存 MHTML
 */
export interface Archive {
  url: string;
  title: string;
  /** Readability 提取的正文 HTML，未消毒，显示前必须过 DOMPurify */
  content: string;
  text: string;
  archivedAt: number;
}

const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
// 浏览器规范只在开头这么多字节里找 <meta charset>
const META_SNIFF_BYTES = 1024;

export const ARCHIVE_PERMISSIONS = { origins: ['<all_urls>'] };

/** 必须是点击事件里的第一个 await；已授权时直接返回 granted。 */
export const requestArchivePermission = () => requestPermissions(ARCHIVE_PERMISSIONS);

function decoderFor(charset: string | undefined): TextDecoder | null {
  if (!charset) return null;
  try {
    return new TextDecoder(charset);
  } catch {
    return null;
  }
}

/** 编码依次看响应头、开头的 <meta charset> / http-equiv，都没有就按 UTF-8。 */
export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, META_SNIFF_BYTES));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const decoder = decoderFor(fromHeader) ?? decoderFor(fromMeta) ?? new TextDecoder();
  return decoder.decode(bytes);
}

/** 提取正文；页面里认不出正文时返回 null。相对链接按 url 转成绝对地址。 */
export function extractArticle(html: string, url: string): Omit<Archive, 'url' | 'archivedAt'> | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const article = new Readability(doc).parse();
  const text = article?.textContent?.trim();
  if (!article?.content || !text) return null;
  return { title: article.title?.trim() || doc.title, content: article.content, text };
}

/** 不带 Cookie 下载网页，只接受 HTML，超过 5MB 不存。失败抛出可直接给用户看的错误。 */
async function fetchHtml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new Error('网页打不开');
  }
  if (!res.ok) throw new Error(`网页返回 ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) throw new Error('不是网页（可能是文件下载）');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PAGE_BYTES) throw new Error('网页太大，超过 5MB');
  return decodeHtml(bytes, contentType);
}

export async function archiveUrl(db: IDBPDatabase<HubDB>, url: string, now: number): Promise<Archive> {
  const article = extractArticle(await fetchHtml(url), url);
  if (!article) throw new Error('没找到正文（可能需要登录或由脚本渲染）');
  const archive = { url, ...article, archivedAt: now };
  await saveArchive(db, archive);
  return archive;
}

export const saveArchive = (db: IDBPDatabase<HubDB>, archive: Archive) => db.put('archives', archive);

export const getArchive = (db: IDBPDatabase<HubDB>, url: string) => db.get('archives', url);

