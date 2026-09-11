import { useCallback, useEffect, useState } from 'react';
import { getHubCtx } from '@/lib/hubContext';
import type { ScanResult } from '@/lib/scan/classify';

/** 读取已保存的扫描结果和已忽略的网址。 */
export function useScanResults() {
  const [results, setResults] = useState<Map<string, ScanResult>>(new Map());
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const { db } = await getHubCtx();
    const [all, ignoredUrls] = await Promise.all([db.getAll('scanResults'), db.getAllKeys('ignoredUrls')]);
    setResults(new Map(all.map((r) => [r.url, r])));
    setIgnored(new Set(ignoredUrls));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { results, ignored, reload };
}
