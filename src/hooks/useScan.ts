import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Bookmark } from '@/lib/bookmarks';
import { getHubCtx } from '@/lib/hubContext';
import type { ScanResult } from '@/lib/scan/classify';
import {
  cancelScan,
  probeNetwork,
  runScan,
  scanTargets,
  summarizeHealth,
  type ScanProgress,
} from '@/lib/scan/scanner';
import {
  checkUrl,
  hasScanPermission,
  isReachable,
  requestScanPermission,
  startObserving,
} from '@/lib/scan/request';

export type ScanPhase = 'idle' | 'running' | 'offline';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useScan(bookmarks: Bookmark[]) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<Map<string, ScanResult>>(new Map());
  const [resumable, setResumable] = useState(false);
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = async () => {
    const { db } = await getHubCtx();
    const [all, run] = await Promise.all([db.getAll('scanResults'), db.get('scanRuns', 'current')]);
    setResults(new Map(all.map((r) => [r.url, r])));
    setResumable(run?.finishedAt === null);
  };

  useEffect(() => {
    void reload();
    void hasScanPermission().then(setPermitted);
  }, []);

  async function start() {
    // 授权框只能在点击手势内弹出，所以在任何其他 await 之前请求
    const granted = permitted || (await requestScanPermission());
    if (!granted) {
      toast.error('没有获得访问网站的权限，无法扫描。其他功能不受影响。');
      return;
    }
    setPermitted(true);
    startObserving();

    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('running');
    try {
      const { db } = await getHubCtx();
      const outcome = await runScan(
        { db, check: checkUrl, probe: () => probeNetwork(isReachable), now: Date.now },
        scanTargets(bookmarks),
        { signal: controller.signal, onProgress: setProgress },
      );
      setPhase(outcome === 'offline' ? 'offline' : 'idle');
      if (outcome === 'finished') toast.success('扫描完成');
    } catch (e) {
      setPhase('idle');
      toast.error(`扫描出错：${errorMessage(e)}`);
    } finally {
      controllerRef.current = null;
      await reload();
    }
  }

  const pause = () => controllerRef.current?.abort();

  async function cancel() {
    controllerRef.current?.abort();
    const { db } = await getHubCtx();
    await cancelScan(db, Date.now());
    setProgress(null);
    await reload();
  }

  const summary = useMemo(() => summarizeHealth(bookmarks, results), [bookmarks, results]);

  return { phase, progress, permitted, resumable, summary, start, pause, cancel };
}
