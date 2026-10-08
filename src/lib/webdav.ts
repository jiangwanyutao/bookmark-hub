import { browser } from 'wxt/browser';
import { requestPermissions } from './permissions';

/**
 * WebDAV 备份：把整份书签（浏览器通用 HTML 格式）放到用户自己的 WebDAV 文件夹，换台电脑或换个浏览器再导回来。
 * 不做同步：单文件全量、手动触发，不需要 id 映射和合并。
 * ponytail: 不加密，靠 HTTPS 和用户自己的服务器；要在不可信的服务器上存再加 AES-GCM 口令加密
 */
export interface WebDavConfig {
  /** 以 / 结尾的文件夹地址 */
  folderUrl: string;
  username: string;
  password: string;
  /** 这台浏览器最近一次备份成功的时间 */
  backedUpAt?: number;
}

export const BACKUP_FILE_NAME = 'bookmark-checkup.html';
const STORAGE_KEY = 'webdavConfig';
const TIMEOUT_MS = 30_000;

// storage 里的数据视为外部输入，读出来先校验
function isWebDavConfig(value: unknown): value is WebDavConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.folderUrl === 'string' && typeof v.username === 'string' && typeof v.password === 'string';
}

/** 只存本机 storage.local，不随浏览器同步。 */
export async function loadWebDavConfig(): Promise<WebDavConfig | null> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value: unknown = stored[STORAGE_KEY];
  return isWebDavConfig(value) ? value : null;
}

export async function saveWebDavConfig(config: WebDavConfig): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: config });
}

/** 只接受 http(s)，账号密码不能写在地址里；补上结尾的 /。无效时返回 null。 */
export function normalizeFolderUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
    return `${u.origin}${u.pathname.replace(/\/*$/, '/')}`;
  } catch {
    return null;
  }
}

/** 必须是点击事件里的第一个 await；已授权时直接返回 granted。 */
export const requestWebDavPermission = (folderUrl: string) => requestPermissions({ origins: [`${new URL(folderUrl).origin}/*`] });

export function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

const STATUS_MESSAGES: Record<number, string> = {
  401: '用户名或密码不对（坚果云要用「第三方应用密码」，不是登录密码）',
  403: '没有权限写这个文件夹',
  404: '文件夹不存在，请先在网盘里建好',
  409: '文件夹不存在，请先在网盘里建好',
  507: '网盘空间不足',
};

async function request(config: WebDavConfig, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.folderUrl}${BACKUP_FILE_NAME}`, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      headers: { ...init.headers, Authorization: basicAuth(config.username, config.password) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(`连不上 ${new URL(config.folderUrl).host}，请检查地址、网络和证书`);
  }
}

const failure = (res: Response) => new Error(STATUS_MESSAGES[res.status] ?? `服务器返回 ${res.status}`);

export async function uploadBackup(config: WebDavConfig, html: string): Promise<void> {
  const res = await request(config, { method: 'PUT', body: html, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (!res.ok) throw failure(res);
}

/** 还没备份过（文件不存在）时返回 null。 */
export async function downloadBackup(config: WebDavConfig): Promise<string | null> {
  const res = await request(config, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw failure(res);
  return res.text();
}
