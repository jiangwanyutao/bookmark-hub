import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getHubCtx } from '@/lib/hubContext';
import { archiveUrl, requestArchivePermission } from '@/lib/archive';
import { getDomain } from '@/lib/bookmarks';
import { runQueue } from '@/lib/scan/queue';

const ARCHIVE_CONCURRENCY = 4;
// 同一网站一次只下载一个，免得被限流
const ARCHIVE_PER_SITE = 1;

/** 读取存档时间（网址 → 存档时间），批量存档网页。 */
export function useArchives() {
  const [dates, setDates] = useState<Map<string, number>>(new Map());

  const reload = useCallback(async () => {
    const { db } = await getHubCtx();
    const all = await db.getAll('archives');
    setDates(new Map(all.map((a) => [a.url, a.archivedAt])));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 必须在点击事件里直接调用：第一个 await 是申请访问网页的权限。 */
  const archive = useCallback(
    async (urls: string[]) => {
      const access = await requestArchivePermission();
      if (access === 'denied') toast.error('没有获得访问网页的权限，无法存档');
      if (access !== 'granted' || urls.length === 0) return;

      const { db } = await getHubCtx();
      const failures: { url: string; reason: string }[] = [];
      let done = 0;
      const id = toast.loading(`正在存档 0 / ${urls.length}`);
      await runQueue(
        urls,
        async (url) => {
          try {
            await archiveUrl(db, url, Date.now());
          } catch (e) {
            failures.push({ url, reason: e instanceof Error ? e.message : String(e) });
          }
          done += 1;
          toast.loading(`正在存档 ${done} / ${urls.length}`, { id });
        },
        { concurrency: ARCHIVE_CONCURRENCY, perKey: ARCHIVE_PER_SITE, keyOf: getDomain },
      );
      await reload();

      if (failures.length === 0) toast.success(`已存档 ${urls.length} 个网页`, { id });
      else if (urls.length === 1) toast.error(`存档失败：${failures[0]!.reason}`, { id });
      else
        toast.warning(`${urls.length - failures.length} 个已存档，${failures.length} 个失败`, {
          id,
          description: `${failures[0]!.url}：${failures[0]!.reason}`,
        });
    },
    [reload],
  );

  return { dates, archive };
}
