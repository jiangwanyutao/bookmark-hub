import type { IDBPDatabase } from 'idb';
import type { HubDB } from '../db';
import {
  aggregateByHost,
  classify,
  isNetworkFailure,
  type Health,
  type NetworkMode,
  type Observation,
  type ScanResult,
} from './classify';
import { runQueue } from './queue';
import { skipReason } from './rules';

export const PROBE_URLS = {
  domestic: 'https://www.baidu.com/favicon.ico',
  overseas: 'https://www.google.com/generate_204',
} as const;

const GLOBAL_CONCURRENCY = 8;
const PER_HOST_CONCURRENCY = 2;
const REPROBE_EVERY = 200;
const REPROBE_AFTER_NETWORK_FAILURES = 10;

export type ProbeResult = NetworkMode | 'offline';
export type ScanOutcome = 'finished' | 'aborted' | 'offline';

/** 当前这一轮扫描；未结束时再次开始即为续扫。 */
export interface ScanRun {
  id: 'current';
  startedAt: number;
  finishedAt: number | null;
}

export interface ScanDeps {
  db: IDBPDatabase<HubDB>;
  check: (url: string, mode: NetworkMode) => Promise<Observation>;
  probe: () => Promise<ProbeResult>;
  now: () => number;
}

export interface ScanProgress {
  total: number;
  done: number;
  networkMode: NetworkMode;
  counts: Record<Health, number>;
}

export interface HealthSummary {
  healthy: number;
  redirected: number;
  broken: number;
  /** 可疑 + 未知，需要用户确认 */
  pending: number;
  skipped: number;
  unscanned: number;
}

/** 国内、境外各探一个地址：都不通为离线，只有境外不通为受限。 */
export async function probeNetwork(isReachable: (url: string) => Promise<boolean>): Promise<ProbeResult> {
  const [domestic, overseas] = await Promise.all([isReachable(PROBE_URLS.domestic), isReachable(PROBE_URLS.overseas)]);
  if (!domestic && !overseas) return 'offline';
  return overseas ? 'normal' : 'restricted';
}

/** 需要扫描的网址：去重，跳过非网页、内网、带敏感参数的。 */
export function scanTargets(bookmarks: { url: string }[]): string[] {
  return [...new Set(bookmarks.map((b) => b.url))].filter((url) => skipReason(url) === null);
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const countHealth = (results: ScanResult[]) => {
  const counts: Record<Health, number> = { healthy: 0, redirected: 0, broken: 0, suspicious: 0, unknown: 0 };
  for (const r of results) counts[r.health] += 1;
  return counts;
};

async function currentRun(deps: ScanDeps): Promise<ScanRun> {
  const existing = await deps.db.get('scanRuns', 'current');
  if (existing && existing.finishedAt === null) return existing;
  const run: ScanRun = { id: 'current', startedAt: deps.now(), finishedAt: null };
  await deps.db.put('scanRuns', run);
  return run;
}

async function resultsInRun(deps: ScanDeps, urls: string[], run: ScanRun) {
  const all = new Map((await deps.db.getAll('scanResults')).map((r) => [r.url, r]));
  return urls.map((url) => all.get(url)).filter((r): r is ScanResult => !!r && r.checkedAt >= run.startedAt);
}

export async function runScan(
  deps: ScanDeps,
  urls: string[],
  { signal, onProgress }: { signal: AbortSignal; onProgress: (p: ScanProgress) => void },
): Promise<ScanOutcome> {
  const run = await currentRun(deps);
  const finished = await resultsInRun(deps, urls, run);
  const finishedUrls = new Set(finished.map((r) => r.url));
  const pending = urls.filter((url) => !finishedUrls.has(url));

  const initialMode = await deps.probe();
  if (initialMode === 'offline') return 'offline';

  let networkMode: NetworkMode = initialMode;
  let stoppedOffline = false;
  let done = finished.length;
  const counts = countHealth(finished);
  // 最近一段连续的网络层失败；断网时这些很可能是断网造成的，要丢弃
  let failureStreak: string[] = [];
  let failuresSinceProbe = 0;
  const dnsFailures: string[] = [];

  const queueController = new AbortController();
  const stopQueue = () => queueController.abort();
  if (signal.aborted) stopQueue();
  signal.addEventListener('abort', stopQueue);
  const report = () => onProgress({ total: urls.length, done, networkMode, counts: { ...counts } });

  const save = async (url: string, obs: Observation) => {
    const result: ScanResult = {
      url,
      ...classify(obs, networkMode),
      httpStatus: obs.status ?? null,
      netError: obs.netError ?? null,
      networkMode,
      checkedAt: deps.now(),
    };
    await deps.db.put('scanResults', result);
    return result;
  };

  const reprobe = async () => {
    const mode = await deps.probe();
    if (mode === 'offline') {
      stoppedOffline = true;
      stopQueue();
    } else {
      networkMode = mode;
    }
  };

  report();
  try {
    await runQueue(
      pending,
      async (url) => {
        const obs = await deps.check(url, networkMode);
        if (stoppedOffline) return;
        const result = await save(url, obs);
        counts[result.health] += 1;
        done += 1;
        if (result.failReason === 'dns') dnsFailures.push(url);
        if (isNetworkFailure(result)) {
          failureStreak.push(url);
          failuresSinceProbe += 1;
        } else {
          failureStreak = [];
          failuresSinceProbe = 0;
        }
        if (failuresSinceProbe >= REPROBE_AFTER_NETWORK_FAILURES || done % REPROBE_EVERY === 0) {
          failuresSinceProbe = 0;
          await reprobe();
        }
        report();
      },
      { concurrency: GLOBAL_CONCURRENCY, perKey: PER_HOST_CONCURRENCY, keyOf: hostOf, signal: queueController.signal },
    );
  } finally {
    signal.removeEventListener('abort', stopQueue);
  }

  if (stoppedOffline) {
    await Promise.all(failureStreak.map((url) => deps.db.delete('scanResults', url)));
    return 'offline';
  }
  if (signal.aborted) return 'aborted';

  // ponytail: DNS 失败在扫描末尾统一重试一次；网址很少时离首次失败可能不足 PRD 说的 30 秒
  for (const url of dnsFailures) {
    if (signal.aborted) return 'aborted';
    await save(url, await deps.check(url, networkMode));
  }

  const latest = await resultsInRun(deps, urls, run);
  const aggregated = aggregateByHost(latest);
  await Promise.all(aggregated.map((r) => deps.db.put('scanResults', r)));
  const aggregatedByUrl = new Map(aggregated.map((r) => [r.url, r]));
  const final = latest.map((r) => aggregatedByUrl.get(r.url) ?? r);

  onProgress({ total: urls.length, done: urls.length, networkMode, counts: countHealth(final) });
  await deps.db.put('scanRuns', { ...run, finishedAt: deps.now() });
  return 'finished';
}

/** 放弃当前这一轮的进度，下次扫描从头开始（已有结果保留）。 */
export async function cancelScan(db: IDBPDatabase<HubDB>, now: number): Promise<void> {
  const run = await db.get('scanRuns', 'current');
  if (run && run.finishedAt === null) await db.put('scanRuns', { ...run, finishedAt: now });
}

/** 按书签（不是网址）统计健康状态，重复书签各算一次。 */
export function summarizeHealth(bookmarks: { url: string }[], results: Map<string, ScanResult>): HealthSummary {
  const summary: HealthSummary = { healthy: 0, redirected: 0, broken: 0, pending: 0, skipped: 0, unscanned: 0 };
  for (const { url } of bookmarks) {
    if (skipReason(url)) {
      summary.skipped += 1;
      continue;
    }
    const r = results.get(url);
    if (!r) summary.unscanned += 1;
    else if (r.health === 'suspicious' || r.health === 'unknown') summary.pending += 1;
    else summary[r.health] += 1;
  }
  return summary;
}
