import { describe, expect, it } from 'vitest';
import { extractTitle, looksLikeSoft404 } from './soft404';

describe('extractTitle', () => {
  it('reads the first <title>, decoding entities and collapsing whitespace', () => {
    expect(extractTitle('<html><head><title>\n  Tom &amp; Jerry &#39;s   page </title></head>')).toBe("Tom & Jerry 's page");
  });

  it('returns null when there is no title', () => {
    expect(extractTitle('<html><body>hi</body></html>')).toBeNull();
  });
});

describe('looksLikeSoft404', () => {
  const at = (finalUrl: string, title: string | null) => ({ requestedUrl: 'https://a.com/post/1', finalUrl, title });

  it.each([
    ['404 Not Found'],
    ['Page Not Found - Example'],
    ['Error 404 | Blog'],
    ['页面不存在'],
    ['抱歉，找不到该页面'],
    ['该内容已被删除'],
    ['商品已下架'],
  ])('flags a 200 page titled "%s"', (title) => {
    expect(looksLikeSoft404(at('https://a.com/post/1', title))).toBe(true);
  });

  it.each([['/404'], ['/404.html'], ['/not-found'], ['/error/404']])('flags a landing on %s', (path) => {
    expect(looksLikeSoft404(at(`https://a.com${path}`, 'Example'))).toBe(true);
  });

  it.each([
    ['React 性能优化指南'],
    ['Top 404 marathons of 2024'.replace('404', '4040')],
    ['HTTP 状态码 4040 解析'],
  ])('leaves a normal page titled "%s" alone', (title) => {
    expect(looksLikeSoft404(at('https://a.com/post/1', title))).toBe(false);
  });

  it('leaves pages without a title alone', () => {
    expect(looksLikeSoft404(at('https://a.com/post/1', null))).toBe(false);
  });
});
