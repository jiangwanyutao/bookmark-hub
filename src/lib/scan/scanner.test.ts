import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openHubDB, type HubDB } from '../db';
import type { NetworkMode, Observation } from './classify';
import {
  PROBE_URLS,
  addVpnHosts,
  cancelScan,
  markUserVerified,
  probeNetwork,
  recheckUrls,
  runScan,
  scanTargets,
  summarizeHealth,
  type ScanDeps,
  type ScanProgress,
} from './scanner';

let db: IDBPDatabase<HubDB>;
let t: number;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  db = await openHubDB();
  t = 0;
});

afterEach(() => db.close());

type Check = ScanDeps['check'];
const deps = (check: Check, probe: ScanDeps['probe'] = async () => 'normal'): ScanDeps => ({
  db,
  check,
  probe,
  now: () => ++t,
});
const okObs = (url: string): Observation => ({ requestedUrl: url, status: 200, finalUrl: url, redirectStatuses: [] });
const netFail = (error: string) => async (url: string): Promise<Observation> => ({
  requestedUrl: url,
  redirectStatuses: [],
  netError: error,
});
const run = (
  d: ScanDeps,
  urls: string[],
  signal = new AbortController().signal,
  onProgress: (p: ScanProgress) => void = () => {},
) => runScan(d, urls, { signal, onProgress });
const hosts = (n: number) => Array.from({ length: n }, (_, i) => `https://site${i}.com/`);

describe('probeNetwork', () => {
  const reachableExcept = (...down: string[]) => async (url: string) => !down.includes(url);

  it.each<[string, string[], NetworkMode | 'offline']>([
    ['both reachable', [], 'normal'],
    ['only overseas down', [PROBE_URLS.overseas], 'restricted'],
    ['both down', [PROBE_URLS.overseas, PROBE_URLS.domestic], 'offline'],
  ])('%s → %s', async (_name, down, expected) => {
    expect(await probeNetwork(reachableExcept(...down))).toBe(expected);
  });
});

describe('runScan', () => {
  it('checks every url once, saves results, reports progress and finishes the run', async () => {
    const check = vi.fn(async (url: string) => okObs(url));
    const progress: ScanProgress[] = [];

    const outcome = await run(deps(check), ['https://a.com/1', 'https://b.com/2'], undefined, (p) => progress.push(p));

    expect(outcome).toBe('finished');
    expect(check).toHaveBeenCalledTimes(2);
    expect((await db.get('scanResults', 'https://a.com/1'))?.health).toBe('healthy');
    expect((await db.get('scanRuns', 'current'))?.finishedAt).not.toBeNull();
    expect(progress.at(-1)).toMatchObject({ total: 2, done: 2, networkMode: 'normal', counts: { healthy: 2 } });
  });

  it('resumes an unfinished run without rechecking urls finished during it', async () => {
    await db.put('scanRuns', { id: 'current', startedAt: 100, finishedAt: null });
    await db.put('scanResults', { ...resultFor('https://a.com/'), checkedAt: 150 });
    await db.put('scanResults', { ...resultFor('https://c.com/'), checkedAt: 50 });
    t = 200;
    const check = vi.fn(async (url: string) => okObs(url));

    await run(deps(check), ['https://a.com/', 'https://b.com/', 'https://c.com/']);

    expect(check.mock.calls.map(([url]) => url).sort()).toEqual(['https://b.com/', 'https://c.com/']);
  });

  it('does not scan at all when offline', async () => {
    const check = vi.fn(async (url: string) => okObs(url));
    expect(await run(deps(check, async () => 'offline'), ['https://a.com/'])).toBe('offline');
    expect(check).not.toHaveBeenCalled();
  });

  it('retries dns failures once and folds a host where every url failed into pending', async () => {
    const check = vi.fn(netFail('net::ERR_NAME_NOT_RESOLVED'));
    const urls = ['https://dead.com/1', 'https://dead.com/2', 'https://dead.com/3'];

    expect(await run(deps(check), urls)).toBe('finished');

    expect(check).toHaveBeenCalledTimes(6);
    for (const url of urls) {
      expect(await db.get('scanResults', url)).toMatchObject({ health: 'unknown', failReason: 'site_unreachable' });
    }
  });

  it('pauses on abort and leaves the run resumable', async () => {
    const controller = new AbortController();
    const check = vi.fn(async (url: string) => {
      controller.abort();
      return okObs(url);
    });

    expect(await run(deps(check), hosts(20), controller.signal)).toBe('aborted');

    expect((await db.get('scanRuns', 'current'))?.finishedAt).toBeNull();
    expect(await db.count('scanResults')).toBeLessThan(20);
  });

  it('stops when the network drops mid-scan and discards the failures it caused', async () => {
    const probe = vi.fn<ScanDeps['probe']>().mockResolvedValueOnce('normal').mockResolvedValue('offline');

    expect(await run(deps(netFail('net::ERR_CONNECTION_RESET'), probe), hosts(30))).toBe('offline');

    expect(await db.count('scanResults')).toBe(0);
    expect((await db.get('scanRuns', 'current'))?.finishedAt).toBeNull();
  });
});

describe('hosts that need VPN', () => {
  it('classifies network failures on those hosts as maybe_vpn during a scan, without dns retry', async () => {
    await db.put('vpnHosts', { host: 'corp.example.com', addedAt: 1 });
    const check = vi.fn(netFail('net::ERR_NAME_NOT_RESOLVED'));

    await run(deps(check), ['https://corp.example.com/wiki']);

    expect(check).toHaveBeenCalledTimes(1);
    expect(await db.get('scanResults', 'https://corp.example.com/wiki')).toMatchObject({
      health: 'unknown',
      failReason: 'maybe_vpn',
    });
  });

  it('marks hosts and immediately moves their existing network failures to maybe_vpn', async () => {
    await db.put('scanResults', { ...resultFor('https://corp.example.com/a'), health: 'broken', failReason: 'dns' });
    await db.put('scanResults', { ...resultFor('https://corp.example.com/b'), health: 'broken', failReason: 'not_found' });
    await db.put('scanResults', { ...resultFor('https://other.com/'), health: 'broken', failReason: 'dns' });

    expect(await addVpnHosts(db, ['corp.example.com'], 5)).toBe(1);

    expect(await db.get('scanResults', 'https://corp.example.com/a')).toMatchObject({ health: 'unknown', failReason: 'maybe_vpn' });
    expect(await db.get('scanResults', 'https://corp.example.com/b')).toMatchObject({ health: 'broken', failReason: 'not_found' });
    expect(await db.get('scanResults', 'https://other.com/')).toMatchObject({ health: 'broken', failReason: 'dns' });
    expect(await db.getAllKeys('vpnHosts')).toEqual(['corp.example.com']);
  });
});

describe('recheckUrls', () => {
  it('saves fresh results for the given urls without touching the current run', async () => {
    await db.put('scanResults', { ...resultFor('https://a.com/'), health: 'broken', failReason: 'not_found' });

    expect(await recheckUrls(deps(async (url) => okObs(url)), ['https://a.com/'])).toBe('done');

    expect(await db.get('scanResults', 'https://a.com/')).toMatchObject({ health: 'healthy', failReason: null });
    expect(await db.get('scanRuns', 'current')).toBeUndefined();
  });

  it('does not check anything when offline', async () => {
    const check = vi.fn(async (url: string) => okObs(url));
    expect(await recheckUrls(deps(check, async () => 'offline'), ['https://a.com/'])).toBe('offline');
    expect(check).not.toHaveBeenCalled();
  });
});

describe('cancelScan', () => {
  it('marks the current run finished so the next scan starts over', async () => {
    await db.put('scanRuns', { id: 'current', startedAt: 1, finishedAt: null });
    await cancelScan(db, 9);
    expect((await db.get('scanRuns', 'current'))?.finishedAt).toBe(9);
  });
});

describe('scanTargets', () => {
  it('keeps unique web urls that are not skipped', () => {
    const list = ['https://a.com/', 'https://a.com/', 'javascript:void(0)', 'http://localhost/', 'https://b.com/?token=1'];
    expect(scanTargets(list.map((url) => ({ url })))).toEqual(['https://a.com/']);
  });
});

describe('summarizeHealth', () => {
  it('counts bookmarks by health, including skipped and not yet scanned', () => {
    const results = new Map(
      [
        resultFor('https://ok.com/'),
        { ...resultFor('https://moved.com/'), health: 'redirected' as const },
        { ...resultFor('https://gone.com/'), health: 'broken' as const },
        { ...resultFor('https://odd.com/'), health: 'suspicious' as const },
        { ...resultFor('https://slow.com/'), health: 'unknown' as const },
      ].map((r) => [r.url, r]),
    );
    const bookmarks = [
      'https://ok.com/',
      'https://ok.com/',
      'https://moved.com/',
      'https://gone.com/',
      'https://odd.com/',
      'https://slow.com/',
      'javascript:void(0)',
      'https://new.com/',
    ].map((url) => ({ url }));

    expect(summarizeHealth(bookmarks, results)).toEqual({
      healthy: 2,
      redirected: 1,
      broken: 1,
      pending: 2,
      skipped: 1,
      unscanned: 1,
      ignored: 0,
    });
    expect(summarizeHealth(bookmarks, results, new Set(['https://gone.com/', 'https://ok.com/']))).toMatchObject({
      healthy: 2,
      broken: 0,
      ignored: 1,
    });
  });
});

function resultFor(url: string) {
  return {
    url,
    health: 'healthy' as const,
    failReason: null,
    httpStatus: 200,
    netError: null,
    redirectTo: null,
    networkMode: 'normal' as const,
    checkedAt: 1,
  };
}

describe('markUserVerified', () => {
  const brokenAt = (url: string) => ({ ...resultFor(url), health: 'broken' as const, failReason: 'not_found' as const, httpStatus: 404 });

  it('turns a result the user confirmed works into healthy and records when', async () => {
    await db.put('scanResults', brokenAt('https://blocked.com/a'));

    await markUserVerified(db, ['https://blocked.com/a'], 7);

    expect(await db.get('scanResults', 'https://blocked.com/a')).toMatchObject({
      health: 'healthy',
      failReason: null,
      userVerified: 7,
    });
  });

  it('keeps the confirmation through a later scan that still cannot reach the site', async () => {
    await db.put('scanResults', brokenAt('https://blocked.com/a'));
    await markUserVerified(db, ['https://blocked.com/a'], 7);

    await run(deps(async (url) => ({ requestedUrl: url, status: 403, finalUrl: url, redirectStatuses: [] })), ['https://blocked.com/a']);

    expect(await db.get('scanResults', 'https://blocked.com/a')).toMatchObject({
      health: 'healthy',
      failReason: null,
      userVerified: 7,
    });
  });

  it('drops the confirmation when the user asks for a recheck', async () => {
    await db.put('scanResults', brokenAt('https://blocked.com/a'));
    await markUserVerified(db, ['https://blocked.com/a'], 7);

    await recheckUrls(deps(async (url) => ({ requestedUrl: url, status: 404, finalUrl: url, redirectStatuses: [] })), [
      'https://blocked.com/a',
    ]);

    const result = await db.get('scanResults', 'https://blocked.com/a');
    expect(result).toMatchObject({ health: 'broken', failReason: 'not_found' });
    expect(result?.userVerified).toBeUndefined();
  });
});
