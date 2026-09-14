import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { topDomains, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { folderTiles, squarify } from '@/lib/treemap';
import { findDuplicateGroups, redundantCount } from '@/lib/duplicates';
import { healthScore, isUncategorized } from '@/lib/health';
import { summarizeHealth } from '@/lib/scan/scanner';
import { useScanResults } from '@/hooks/useScanResults';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const TOP_DOMAIN_LIMIT = 10;
const MAP_TILE_LIMIT = 12;
// 在 200×100 的坐标里布局，渲染时换算成百分比，容器用 2:1 比例
const MAP_W = 200;
const MAP_H = 100;

const formatCount = (n: number) => n.toLocaleString('zh-CN');

type Target = 'scan' | 'broken' | 'duplicates' | 'redirected' | 'pending';

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  barId: string;
  onNavigate: (target: Target) => void;
  onOpenFolder: (folderId: string) => void;
}

export function Overview({ index, roots, barId, onNavigate, onOpenFolder }: Props) {
  const { results, ignored } = useScanResults();
  const domains = topDomains(index.bookmarks, TOP_DOMAIN_LIMIT);
  const maxCount = domains[0]?.count ?? 0;

  const duplicates = useMemo(() => redundantCount(findDuplicateGroups(index.bookmarks)), [index]);
  const health = useMemo(() => summarizeHealth(index.bookmarks, results, ignored), [index, results, ignored]);
  const uncategorized = useMemo(
    () => index.bookmarks.filter((b) => isUncategorized(b, barId)).length,
    [index, barId],
  );
  const score = healthScore({
    total: index.bookmarks.length,
    broken: health.broken,
    redundant: duplicates,
    redirected: health.redirected,
    uncategorized,
  });

  const stats = [
    { label: '总书签', value: index.bookmarks.length },
    { label: '文件夹', value: index.folderCount },
    { label: '失效', value: health.broken, tone: health.broken > 0 ? 'text-destructive' : undefined },
    {
      label: '重复',
      value: duplicates,
      tone: duplicates > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
    },
  ];

  const tasks: { label: string; count: number; action: string; target: Target }[] = [
    { label: '个失效链接', count: health.broken, action: '立即处理', target: 'broken' },
    { label: '条重复书签', count: duplicates, action: '清理重复', target: 'duplicates' },
    { label: '个永久重定向', count: health.redirected, action: '批量更新', target: 'redirected' },
    { label: '个待确认链接', count: health.pending, action: '查看', target: 'pending' },
    { label: '个书签还没扫描', count: health.unscanned, action: '扫描书签', target: 'scan' },
  ];
  const openTasks = tasks.filter((t) => t.count > 0);

  const tiles = useMemo(() => folderTiles(roots, index.countByFolder, MAP_TILE_LIMIT), [roots, index]);
  const rects = useMemo(
    () => squarify(tiles.map((t) => ({ id: t.id, value: t.value })), { x: 0, y: 0, w: MAP_W, h: MAP_H }),
    [tiles],
  );

  return (
    <section className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的书签</h1>
        <p className="mt-1 text-sm text-muted-foreground">检测失效、清理重复、用智能体重排分类，所有改动都可撤销。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-0">
            <CardHeader className="gap-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wide">{s.label}</CardDescription>
              <CardTitle className={`text-3xl font-semibold tabular-nums ${s.tone ?? ''}`}>
                {formatCount(s.value)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Bookmark Health</CardDescription>
            <CardTitle className="text-4xl tabular-nums">
              {score}
              <span className="text-base font-normal text-muted-foreground"> / 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={score} aria-label="书签健康度" />
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatCount(health.healthy)} 正常 · {formatCount(health.redirected)} 重定向 · {formatCount(health.broken)} 失效 ·{' '}
              {formatCount(health.pending)} 待确认 · {formatCount(health.skipped)} 已跳过
            </p>
            {health.unscanned > 0 && (
              <p className="text-xs text-muted-foreground">
                还有 {formatCount(health.unscanned)} 个书签没扫描，扫描后分数更准确。
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>需要你处理</CardTitle>
          </CardHeader>
          <CardContent>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">没有需要处理的问题。</p>
            ) : (
              <ul className="divide-y">
                {openTasks.map((t) => (
                  <li key={t.target} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <span>
                      <span className="font-semibold tabular-nums">{formatCount(t.count)}</span> {t.label}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => onNavigate(t.target)}>
                      {t.action}
                      <ChevronRight />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>书签地图</CardTitle>
          <CardDescription>面积代表书签数量，点击进入对应目录。</CardDescription>
        </CardHeader>
        <CardContent>
          {rects.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有书签。</p>
          ) : (
            <div className="relative aspect-[2/1] w-full overflow-hidden rounded-md border">
              {rects.map((r) => {
                const rank = tiles.findIndex((t) => t.id === r.id);
                const tile = tiles[rank]!;
                // 越大的目录颜色越深
                const shade = 95 - (rank / Math.max(tiles.length - 1, 1)) * 45;
                return (
                  <div
                    key={r.id}
                    className="absolute p-0.5"
                    style={{
                      left: `${(r.x / MAP_W) * 100}%`,
                      top: `${(r.y / MAP_H) * 100}%`,
                      width: `${(r.w / MAP_W) * 100}%`,
                      height: `${(r.h / MAP_H) * 100}%`,
                    }}
                  >
                    <button
                      type="button"
                      disabled={!tile.folderId}
                      onClick={() => tile.folderId && onOpenFolder(tile.folderId)}
                      title={`${tile.name}：${tile.value} 个书签`}
                      className="flex size-full flex-col items-start overflow-hidden rounded-sm p-2 text-left text-xs text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:opacity-100"
                      style={{ backgroundColor: `color-mix(in oklch, var(--primary) ${shade}%, var(--muted))` }}
                    >
                      <span className="w-full truncate font-medium">{tile.name}</span>
                      <span className="tabular-nums opacity-80">{formatCount(tile.value)}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>收藏最多��网站</CardTitle>
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
