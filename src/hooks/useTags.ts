import { useCallback, useEffect, useState } from 'react';
import { getHubCtx } from '@/lib/hubContext';
import { saveTags } from '@/lib/ai/tags';

/** 读取与保存书签标签（网址 → 标签）。 */
export function useTags() {
  const [tags, setTags] = useState<Map<string, string[]>>(new Map());

  const reload = useCallback(async () => {
    const { db } = await getHubCtx();
    const all = await db.getAll('tags');
    setTags(new Map(all.map((t) => [t.url, t.tags])));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (entries: [url: string, tags: string[]][]) => {
      const { db } = await getHubCtx();
      await saveTags(db, entries, Date.now());
      await reload();
    },
    [reload],
  );

  return { tags, save };
}
