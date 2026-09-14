import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageOf = (url: string) => new URL(url).searchParams.get('pageUrl') ?? '';

describe('hasRealFavicon', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('location', { origin: 'chrome-extension://test' });
  });

  it('treats the browser placeholder as missing and anything else as a real icon', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(pageOf(url).includes('github') ? 'real-icon' : 'globe'));
    const { hasRealFavicon } = await import('./favicon');

    expect(await hasRealFavicon('https://github.com/')).toBe(true);
    expect(await hasRealFavicon('https://unknown.example/')).toBe(false);
  });

  it('shows the image when the placeholder probe fails', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (pageOf(url).includes('.invalid')) throw new Error('offline');
      return new Response('globe');
    });
    const { hasRealFavicon } = await import('./favicon');

    expect(await hasRealFavicon('https://unknown.example/')).toBe(true);
  });

  it('treats a failed icon request as missing', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response('x', { status: pageOf(url).includes('broken') ? 404 : 200 }));
    const { hasRealFavicon } = await import('./favicon');

    expect(await hasRealFavicon('https://broken.example/')).toBe(false);
  });
});
