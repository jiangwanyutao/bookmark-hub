import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Bookmark } from '@/lib/bookmarks';
import { getHubCtx } from '@/lib/hubContext';
import { cancelScan, runScan, scanTargets, summarizeHealth, type ScanProgress } from '@/lib/scan/scanner';
import { browserScanDeps, ensureScanAccess, hasScanPermission } from '@/lib/scan/request';
import { useScanResults } from './useScanResults';

export type ScanPhase = 'idle' | 'running' | 'offline';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useScan(bookmarks: Bookmark[]) {
  const { results, ignored, reload } = useScanResults();
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [resumable, setResumable] = useState(false);
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refreshRun = async () => {
    const { db } = await getHubCtx();
    const run = await db.get('scanRuns', 'current');
    setResumable(run?.finishedAt === null);
  };

  useEffect(() => {
    void refreshRun();
    void hasScanPermission().then(setPermitted);
  }, []);

  async function start() {
    const access = await ensureScanAccess();
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问网站的权限，无法扫描。其他功能不受影响。');
      return;
    }
    setPermitted(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('running');
    try {
      const { db } = await getHubCtx();
      const outcome = await runScan(browserScanDeps(db), scanTargets(bookmarks), {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setPhase(outcome === 'offline' ? 'offline' : 'idle');
      if (outcome === 'finished') toast.success('扫描完成');
    } catch (e) {
      setPhase('idle');
      toast.error(`扫描出错：${errorMessage(e)}`);
    } finally {
      controllerRef.current = null;
      await Promise.all([reload(), refreshRun()]);
    }
  }

  const pause = () => controllerRef.current?.abort();

  async function cancel() {
    controllerRef.current?.abort();
    const { db } = await getHubCtx();
    await cancelScan(db, Date.now());
    setProgress(null);
    await refreshRun();
  }

  const summary = useMemo(() => summarizeHealth(bookmarks, results, ignored), [bookmarks, results, ignored]);

  return { phase, progress, permitted, resumable, summary, start, pause, cancel };
}
