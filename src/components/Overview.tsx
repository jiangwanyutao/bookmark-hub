import { useMemo } from 'react';
import { topDomains, type BookmarkIndex } from '@/lib/bookmarks';
import { findDuplicateGroups, redundantCount } from '@/lib/duplicates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const TOP_DOMAIN_LIMIT = 10;

const formatCount = (n: number) => n.toLocaleString('zh-CN');

export function Overview({ index }: { index: BookmarkIndex }) {
  const domains = topDomains(index.bookmarks, TOP_DOMAIN_LIMIT);
  const maxCount = domains[0]?.count ?? 0;
  const duplicates = useMemo(() => redundantCount(findDuplicateGroups(index.bookmarks)), [index]);

  const stats = [
    { label: '总书签', value: index.bookmarks.length },
    { label: '文件夹', value: index.folderCount },
    { label: '重复书签', value: duplicates },
  ];

  return (
    <section className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">我的书签</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{formatCount(s.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>收藏最多的网站</CardTitle>
        </CardHeader>
        <CardContent>
          {domains.length > 0 ? (
            <ol className="space-y-1">
              {domains.map((d) => (
                <li key={d.domain} className="relative flex justify-between rounded-md px-3 py-1.5 text-sm">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                  <span className="relative">{d.domain}</span>
                  <span className="relative text-muted-foreground tabular-nums">{formatCount(d.count)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">还没有网页书签。</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
