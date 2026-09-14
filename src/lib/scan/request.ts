import type { IDBPDatabase } from 'idb';
import { browser } from 'wxt/browser';
import type { HubDB } from '../db';
import { requestPermissions, type PermissionResult } from '../permissions';
import type { Observation } from './classify';
import { extractTitle } from './soft404';
import { probeNetwork, type ScanDeps } from './scanner';

const REQUEST_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
// onErrorOccurred 可能比 fetch 失败晚一点到
const ERROR_EVENT_GRACE_MS = 50;
const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 30_000;
// 读标题只下载网页开头这么多字节
const TITLE_READ_BYTES = 64 * 1024;

const SCAN_PERMISSIONS = { permissions: ['webRequest' as const], origins: ['<all_urls>'] };

interface Tracking {
  requestId?: string;
  redirectStatuses: number[];
  netError?: string;
}

const trackingByUrl = new Map<string, Tracking>();
const trackingById = new Map<string, Tracking>();
let observing = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const hasScanPermission = () => browser.permissions.contains(SCAN_PERMISSIONS);

/** 必须在点击事件里第一时间调用，浏览器只在用户手势内弹出授权框。 */
export const requestScanPermission = () => requestPermissions(SCAN_PERMISSIONS);

// 惰性求值：Dashboard 在纯网页/预览环境（无 browser API）里加载此模块时不能在顶层访问 runtime。
let extensionOrigin: string | undefined;
const getExtensionOrigin = () => {
  extensionOrigin ??= new URL(browser.runtime.getURL('/')).origin;
  return extensionOrigin;
};

/**
 * 通过 webRequest 拿到 fetch 拿不到的信息：跳转链每一跳的状态码、网络错误码。
 * 只看本扩展发出的请求（按 initiator 判断）。须在获得 webRequest 权限后调用。
 */
export function startObserving() {
  if (observing) return;
  observing = true;
  const filter = { urls: ['<all_urls>'] };

  browser.webRequest.onBeforeRequest.addListener((details) => {
    // Dashboard 在标签页里运行，请求的 tabId 是那个标签页而不是 -1，不能用 tabId 判断来源
    if (details.initiator !== getExtensionOrigin()) return undefined;
    const tracking = trackingByUrl.get(details.url);
    if (tracking && !tracking.requestId) {
      tracking.requestId = details.requestId;
      trackingById.set(details.requestId, tracking);
    }
    return undefined;
  }, filter);
  browser.webRequest.onBeforeRedirect.addListener((details) => {
    trackingById.get(details.requestId)?.redirectStatuses.push(details.statusCode);
  }, filter);
  browser.webRequest.onErrorOccurred.addListener((details) => {
    const tracking = trackingById.get(details.requestId);
    if (tracking) tracking.netError ??= details.error;
  }, filter);
}

function parseRetryAfter(value: string | null): number {
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

async function attempt(
  url: string,
  method: 'HEAD' | 'GET',
): Promise<Observation & { retryAfterMs: number; contentType?: string }> {
  const key = new URL(url).href;
  const tracking: Tracking = { redirectStatuses: [] };
  trackingByUrl.set(key, tracking);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    // 不带 Cookie，不暴露用户登录态
    const res = await fetch(url, { method, credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: controller.signal });
    if (method === 'GET') controller.abort(); // 只要响应头，不下载正文
    return {
      requestedUrl: url,
      status: res.status,
      finalUrl: res.url,
      redirectStatuses: tracking.redirectStatuses,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      contentType: res.headers.get('content-type') ?? undefined,
    };
  } catch {
    await sleep(ERROR_EVENT_GRACE_MS);
    return {
      requestedUrl: url,
      redirectStatuses: tracking.redirectStatuses,
      netError: timedOut ? undefined : (tracking.netError ?? 'net::ERR_FAILED'),
      timedOut,
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
    };
  } finally {
    clearTimeout(timer);
    trackingByUrl.delete(key);
    if (tracking.requestId) trackingById.delete(tracking.requestId);
  }
}

/**
 * 下载网页开头（最多 64KB）取 <title>，用于软 404 检测。失败只返回 null，不影响判定。
 * ponytail: 编码只看响应头的 charset；只在 <meta> 里声明 GBK 的页面会被当成 UTF-8，标题关键词可能漏判
 */
async function fetchTitle(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: controller.signal });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !res.body || !contentType.includes('text/html')) return null;

    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(/charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8');
    } catch {
      decoder = new TextDecoder();
    }
    const reader = res.body.getReader();
    let html = '';
    let bytes = 0;
    while (bytes < TITLE_READ_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/title>/i.test(html)) break;
    }
    return extractTitle(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort(); // 不再下载剩余正文
  }
}

/**
 * 先发 HEAD；4xx / 5xx 时用 GET 再确认一次（不少网站不支持 HEAD）；429 按 Retry-After 退避重试一次。
 * 最终是 2xx 的 HTML 页面时，再读一次标题供软 404 检测。
 */
export async function checkUrl(url: string): Promise<Observation> {
  let method: 'HEAD' | 'GET' = 'HEAD';
  let result = await attempt(url, method);
  if (result.status !== undefined && result.status >= 400) {
    method = 'GET';
    result = await attempt(url, method);
  }
  if (result.status === 429) {
    await sleep(result.retryAfterMs);
    result = await attempt(url, method);
  }
  const ok = result.status !== undefined && result.status >= 200 && result.status < 300;
  if (ok && result.contentType?.includes('text/html')) {
    return { ...result, title: await fetchTitle(result.finalUrl ?? url) };
  }
  return result;
}

/**
 * 申请扫描权限并开始观察请求。必须是点击事件里的第一个 await，
 * 已授权时浏览器直接返回 true，不会再弹框。
 */
export async function ensureScanAccess(): Promise<PermissionResult> {
  const result = await requestScanPermission();
  if (result === 'granted') startObserving();
  return result;
}

export const browserScanDeps = (db: IDBPDatabase<HubDB>): ScanDeps => ({
  db,
  check: checkUrl,
  probe: () => probeNetwork(isReachable),
  now: Date.now,
});

export async function isReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}
