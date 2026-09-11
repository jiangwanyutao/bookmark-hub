import type { IDBPDatabase } from 'idb';
import { browser } from 'wxt/browser';
import type { HubDB } from '../db';
import { requestPermissions, type PermissionResult } from '../permissions';
import type { Observation } from './classify';
import { probeNetwork, type ScanDeps } from './scanner';

const REQUEST_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
// onErrorOccurred 可能比 fetch 失败晚一点到
const ERROR_EVENT_GRACE_MS = 50;
const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 30_000;

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

/**
 * 通过 webRequest 拿到 fetch 拿不到的信息：跳转链每一跳的状态码、网络错误码。
 * 只看扩展自己发出的请求（tabId 为 -1）。须在获得 webRequest 权限后调用。
 */
export function startObserving() {
  if (observing) return;
  observing = true;
  const filter = { urls: ['<all_urls>'] };

  browser.webRequest.onBeforeRequest.addListener((details) => {
    if (details.tabId !== -1) return undefined;
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

async function attempt(url: string, method: 'HEAD' | 'GET'): Promise<Observation & { retryAfterMs: number }> {
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

/** 先发 HEAD；4xx / 5xx 时用 GET 再确认一次（不少网站不支持 HEAD）；429 按 Retry-After 退避重试一次。 */
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
