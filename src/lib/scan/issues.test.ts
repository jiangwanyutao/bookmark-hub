import { describe, expect, it } from 'vitest';
import type { ScanResult } from './classify';
import { collectIssues } from './issues';

const result = (url: string, health: ScanResult['health'], failReason: ScanResult['failReason'] = null): ScanResult => ({
  url,
  health,
  failReason,
  httpStatus: null,
  netError: null,
  redirectTo: null,
  networkMode: 'normal',
  checkedAt: 1,
});

const results = new Map(
  [
    result('https://gone.com/', 'broken', 'not_found'),
    result('https://dns.com/', 'broken', 'dns'),
    result('https://moved.com/', 'redirected'),
    result('https://odd.com/', 'suspicious', 'cert'),
    result('https://slow.com/', 'unknown', 'timeout'),
    result('https://ok.com/', 'healthy'),
  ].map((r) => [r.url, r]),
);

const bookmarks = [
  'https://gone.com/',
  'https://gone.com/',
  'https://dns.com/',
  'https://moved.com/',
  'https://odd.com/',
  'https://slow.com/',
  'https://ok.com/',
  'https://never-scanned.com/',
].map((url, i) => ({ id: String(i), url }));

const urls = (issues: { bookmark: { url: string } }[]) => issues.map((i) => i.bookmark.url);

describe('collectIssues', () => {
  it('lists every bookmark whose url is broken, one entry per bookmark', () => {
    const { active, ignored } = collectIssues(bookmarks, results, new Set(), 'broken');
    expect(urls(active)).toEqual(['https://gone.com/', 'https://gone.com/', 'https://dns.com/']);
    expect(ignored).toEqual([]);
  });

  it('moves ignored urls into their own list', () => {
    const { active, ignored } = collectIssues(bookmarks, results, new Set(['https://dns.com/']), 'broken');
    expect(urls(active)).toEqual(['https://gone.com/', 'https://gone.com/']);
    expect(urls(ignored)).toEqual(['https://dns.com/']);
  });

  it('groups suspicious and unknown results as pending', () => {
    expect(urls(collectIssues(bookmarks, results, new Set(), 'pending').active)).toEqual([
      'https://odd.com/',
      'https://slow.com/',
    ]);
  });

  it('lists redirected bookmarks with their scan result', () => {
    const { active } = collectIssues(bookmarks, results, new Set(), 'redirected');
    expect(urls(active)).toEqual(['https://moved.com/']);
    expect(active[0]!.result.health).toBe('redirected');
  });
});
