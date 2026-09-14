import { useMemo, type ComponentType } from 'react';
import {
  Activity,
  ChevronRight,
  CircleHelp,
  Copy,
  CornerUpRight,
  Link2Off,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { topDomains, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { folderTiles, squarify } from '@/lib/treemap';
import { findDuplicateGroups, redundantCount } from '@/lib/duplicates';
import { healthScore, isUncategorized } from '@/lib/health';
import { summarizeHealth } from '@/lib/scan/scanner';
import { useScanResults } from '@/hooks/useScanResults';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Lighthouse } from './brand/Lighthouse';
import { Favicon } from './Favicon';

const TOP_DOMAIN_LIMIT = 8;
const MAP_TILE_LIMIT = 12;
// 在 180×40 的坐标里布局，渲染时换算成百分比，容器用 9:2 比例（宽屏下约 240px 高）
const MAP_W = 180;
const MAP_H = 40;
// 格子太小时少放文字：1 个单位约 6px
const LABEL_MIN_W = 7;
const LABEL_MIN_H = 4;
const DETAIL_MIN_W = 14;
const DETAIL_MIN_H = 8;
// 健康度分档：≥ 80 良好，≥ 50 一般，其余较差
const HEALTH_GOOD = 80;
const HEALTH_FAIR = 50;
// Treemap 主色占比：浅色阶，文字一律用前景色，亮暗两种模式对比度都 ≥ 4.5（见 docs/design-system.md）
const TINT_MIN = 6;
const TINT_MAX = 32;

const formatCount = (n: number) => n.toLocaleString('zh-CN');
const tint = (percent: number) => `color-mix(in srgb, var(--primary) ${percent}%, var(--card))`;

type Target = 'scan' | 'broken' | 'duplicates' | 'redirected' | 'pending';
type Icon = ComponentType<{ className?: string }>;

// 状态靠图标 + 文字表达，颜色只上在图标和进度条上
const HEALTH_LEVELS = [
  { min: HEALTH_GOOD, label: '良好', icon: ShieldCheck, tone: 'text-primary', fill: 'bg-primary' },
  { min: HEALTH_FAIR, label: '一般', icon: ShieldAlert, tone: 'text-amber-600 dark:text-amber-400', fill: 'bg-amber-500' },
  { min: 0, label: '较差', icon: ShieldX, tone: 'text-destructive', fill: 'bg-destructive' },
];

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  barId: string;
  onNavigate: (target: Target) => void;
  onOpenFolder: (folderId: string) => void;
}

function SectionTitle({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Overview({ index, roots, barId, onNavigate, onOpenFolder }: Props) {
  const { results, ignored } = useScanResults();
  const domains = topDomains(index.bookmarks, TOP_DOMAIN_LIMIT);

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
  const level = HEALTH_LEVELS.find((l) => score >= l.min) ?? HEALTH_LEVELS[HEALTH_LEVELS.length - 1]!;

  const tasks: { phrase: string; hint: string; count: number; action: string; target: Target; icon: Icon; chip: string }[] = [
    {
      phrase: `${formatCount(health.broken)} 个失效链接`,
      hint: '网页已经打不开，可以删除或忽略',
      count: health.broken,
      action: '去处理',
      target: 'broken',
      icon: Link2Off,
      chip: 'bg-coral text-coral-foreground',
    },
    {
      phrase: `${formatCount(duplicates)} 条重复书签`,
      hint: '同一个网址收藏了不止一次',
      count: duplicates,
      action: '去清理',
      target: 'duplicates',
      icon: Copy,
      chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    },
    {
      phrase: `${formatCount(health.redirected)} 个网址已搬家`,
      hint: '网站换了新地址，可以一键更新',
      count: health.redirected,
      action: '去更新',
      target: 'redirected',
      icon: CornerUpRight,
      chip: 'bg-accent text-accent-foreground',
    },
    {
      phrase: `${formatCount(health.pending)} 个链接待确认`,
      hint: '暂时判断不了，需要你看一眼',
      count: health.pending,
      action: '去看看',
      target: 'pending',
      icon: CircleHelp,
      chip: 'bg-muted text-muted-foreground',
    },
    {
      phrase: `${formatCount(health.unscanned)} 个书签还没检查`,
      hint: '检查一遍才知道哪些已经失效',
      count: health.unscanned,
      action: '开始检查',
      target: 'scan',
      icon: Activity,
      chip: 'bg-muted text-muted-foreground',
    },
  ];
  const openTasks = tasks.filter((t) => t.count > 0);
  const firstTask = openTasks[0];
  const headline =
    openTasks.length === 0 ? '书签都很健康，暂时没有要处理的事' : `发现 ${openTasks.slice(0, 2).map((t) => t.phrase).join('，')}`;

  const tiles = useMemo(() => folderTiles(roots, index.countByFolder, MAP_TILE_LIMIT), [roots, index]);
  const rects = useMemo(
    () => squarify(tiles.map((t) => ({ id: t.id, value: t.value })), { x: 0, y: 0, w: MAP_W, h: MAP_H }),
    [tiles],
  );
  const mapTotal = tiles.reduce((sum, t) => sum + t.value, 0);

  return (
    <section className="mx-auto max-w-6xl p-8">
      <div className="grid items-end gap-x-10 gap-y-6 overflow-hidden rounded-2xl bg-accent px-8 pt-8 text-accent-foreground lg:grid-cols-[minmax(0,1fr)_15rem_8rem]">
        <div className="space-y-3 self-center pb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">{headline}</h1>
          <p className="text-sm">
            共 {formatCount(index.bookmarks.length)} 个书签、{formatCount(index.folderCount)} 个文件夹，所有改动都能在「操作记录」里撤销。
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {firstTask && (
              <Button onClick={() => onNavigate(firstTask.target)}>
                {firstTask.action}
                <ChevronRight />
              </Button>
            )}
            {firstTask?.target !== 'scan' && (
              <Button variant="outline" onClick={() => onNavigate('scan')}>
                <Activity />
                健康扫描
              </Button>
            )}
          </div>
        </div>

        <div className="self-center pb-8 lg:border-l lg:border-accent-foreground/15 lg:pl-8">
          <div className="flex items-center justify-between text-xs">
            <span>书签健康度</span>
            <span className="flex items-center gap-1 font-medium text-foreground">
              <level.icon className={cn('size-4', level.tone)} />
              {level.label}
            </span>
          </div>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-5xl font-semibold tracking-tight text-foreground">{score}</span>
            <span className="text-sm">/ 100</span>
          </p>
          <div
            role="meter"
            aria-label="书签健康度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            className="mt-3 h-2 overflow-hidden rounded-full bg-card"
          >
            <div className={cn('h-full rounded-full', level.fill)} style={{ width: `${score}%` }} />
          </div>
          <p className="mt-3 text-xs tabular-nums">
            {formatCount(health.healthy)} 正常 · {formatCount(health.broken)} 失效 · {formatCount(health.redirected)} 搬家 ·{' '}
            {formatCount(health.unscanned)} 未检查
          </p>
        </div>

        <Lighthouse beam className="-mr-4 hidden h-40 w-auto self-end lg:block" />
      </div>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SectionTitle title="待办" hint={openTasks.length > 0 ? `${openTasks.length} 项` : undefined} />
          {openTasks.length === 0 ? (
            <div className="flex items-center gap-5 rounded-xl border bg-card p-6">
              <Lighthouse className="h-20 w-auto shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">一切正常</p>
                <p className="text-sm text-muted-foreground">没有失效、重复或待确认的书签，隔段时间再来扫描一次就好。</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {openTasks.map((t) => (
                <li key={t.target}>
                  <button
                    type="button"
                    onClick={() => onNavigate(t.target)}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', t.chip)}>
                      <t.icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium tabular-nums">{t.phrase}</span>
                      <span className="block text-xs text-muted-foreground">{t.hint}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
                      {t.action}
                      <ChevronRight className="size-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-5">
          <SectionTitle title="常去的网站" hint="按收藏数量" />
          {domains.length > 0 ? (
            <ol className="grid grid-cols-2 gap-x-6">
              {domains.map((d) => (
                <li key={d.domain} className="flex items-center gap-3 border-b py-2.5">
                  <Favicon url={`https://${d.domain}/`} name={d.domain} className="size-6 rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-sm">{d.domain}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{formatCount(d.count)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">还没有网页书签。</p>
          )}
        </div>
      </div>

      <div className="mt-14">
        <SectionTitle
          title="书签分布"
          hint={
            <span aria-hidden className="flex items-center gap-1.5">
              面积越大书签越多，点击进入目录
              {[TINT_MIN, (TINT_MIN + TINT_MAX) / 2, TINT_MAX].map((p) => (
                <span key={p} className="size-3 rounded-sm border" style={{ backgroundColor: tint(p) }} />
              ))}
            </span>
          }
        />
        {rects.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有书签。</p>
        ) : (
          <div className="relative aspect-[9/2] w-full overflow-hidden rounded-xl border bg-card p-1">
            {rects.map((r) => {
              const rank = tiles.findIndex((t) => t.id === r.id);
              const tile = tiles[rank]!;
              // 越大的目录颜色越浓
              const mix = Math.round(TINT_MAX - (rank / Math.max(tiles.length - 1, 1)) * (TINT_MAX - TINT_MIN));
              const percent = mapTotal > 0 ? Math.round((tile.value / mapTotal) * 100) : 0;
              const label = `${tile.name}：${formatCount(tile.value)} 个书签，占 ${percent}%`;
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
                    title={label}
                    aria-label={label}
                    className="flex size-full flex-col justify-between overflow-hidden rounded-lg px-2.5 py-2 text-left text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:opacity-100"
                    style={{ backgroundColor: tint(mix) }}
                  >
                    {r.w >= LABEL_MIN_W && r.h >= LABEL_MIN_H && <span className="w-full truncate text-sm font-medium">{tile.name}</span>}
                    {r.w >= DETAIL_MIN_W && r.h >= DETAIL_MIN_H && (
                      <span className="text-xs tabular-nums">
                        {formatCount(tile.value)} 个 · {percent}%
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
