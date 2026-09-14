// 浏览器本地缓存的网站图标（favicon 权限），不发网络请求
export const faviconUrl = (pageUrl: string, size = 64) =>
  `${location.origin}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;

// 没缓存图标时 _favicon 返回 200 + 一张默认地球图，<img onError> 不会触发。
// 默认图随 Chrome 版本变，所以运行时拿一个必然没有图标的网址取指纹再比对，不写死。
const PROBE_URL = 'https://favicon-probe.invalid/';

async function fingerprint(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const digest = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

const placeholders = new Map<number, Promise<string | null>>();
const known = new Map<string, Promise<boolean>>();

/** 浏览器缓存里是否真有这个网站的图标；没有时调用方显示首字。结果按网址缓存到页面关闭。 */
export function hasRealFavicon(pageUrl: string, size = 64): Promise<boolean> {
  const key = `${size}:${pageUrl}`;
  let result = known.get(key);
  if (!result) {
    let placeholder = placeholders.get(size);
    if (!placeholder) {
      placeholder = fingerprint(faviconUrl(PROBE_URL, size));
      placeholders.set(size, placeholder);
    }
    // 探测失败（placeholder 为 null）时按有图标处理，退回原来的行为
    result = Promise.all([fingerprint(faviconUrl(pageUrl, size)), placeholder]).then(
      ([hash, fallback]) => hash !== null && hash !== fallback,
    );
    known.set(key, result);
  }
  return result;
}
