import { useMemo, type ComponentType, type ReactNode } from 'react';
import {
  Activity,
  Bookmark as BookmarkIcon,
  ChevronRight,
  CircleHelp,
  Copy,
  CornerUpRight,
  Link2Off,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { topDomains, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { folderTiles } from '@/lib/treemap';
import { findDuplicateGroups, redundantCount } from '@/lib/duplicates';
import { healthScore, isUncategorized } from '@/lib/health';
import { summarizeHealth } from '@/lib/scan/scanner';
import { useScanResults } from '@/hooks/useScanResults';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Lighthouse } from './brand/Lighthouse';
import { Bookshelf } from './Bookshelf';
import { CountUp } from './CountUp';
import { Favicon } from './Favicon';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';
import { Pill, type PillTone } from './Pill';

const TOP_DOMAIN_LIMIT = 10;
const SHELF_BOOK_LIMIT = 12;
// 健康度分档：≥ 80 良好，≥ 50 一般，其余较差
const HEALTH_GOOD = 80;
const HEALTH_FAIR = 50;

const formatCount = (n: number) => n.toLocaleString('zh-CN');

type Target = 'scan' | 'broken' | 'duplicates' | 'redirected' | 'pending' | 'organize';
type Icon = ComponentType<{ className?: string }>;

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  barId: string;
  onNavigate: (target: Target) => void;
  onOpenFolder: (folderId: string) => void;
}

function StatCard({
  label,
  icon: Icon,
  value,
  detail,
  onClick,
}: {
  label: string;
  icon: Icon;
  value: number;
  detail?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-2xl leading-tight font-semibold tabular-nums">
          <CountUp value={value} />
        </span>
      </span>
      {detail}
    </>
  );
  const base = 'flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-card';
  if (!onClick) return <div className={base}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, 'outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:translate-y-px')}
    >
      {content}
    </button>
  );
}

export function Overview({ index, roots, barId, onNavigate, onOpenFolder }: Props) {
  const { results, ignored } = useScanResults();
  const domains = topDomains(index.bookmarks, TOP_DOMAIN_LIMIT);

  const duplicates = useMemo(() => redundantCount(findDuplicateGroups(index.bookmarks)), [index]);
  const health = useMemo(() => summarizeHealth(index.bookmarks, results, ignored), [index, results, ignored]);
  const uncategorized = useMemo(() => index.bookmarks.filter((b) => isUncategorized(b, barId)).length, [index, barId]);
  const score = healthScore({
    total: index.bookmarks.length,
    broken: health.broken,
    redundant: duplicates,
    redirected: health.redirected,
    uncategorized,
  });
  const level: { label: string; tone: PillTone } =
    score >= HEALTH_GOOD ? { label: '良好', tone: 'ok' } : score >= HEALTH_FAIR ? { label: '一般', tone: 'warn' } : { label: '较差', tone: 'danger' };

  const tasks: { phrase: string; hint: string; count: number; target: Target; icon: Icon }[] = [
    { phrase: `${formatCount(health.broken)} 个失效链接`, hint: '网页已经打不开，可以删除或忽略', count: health.broken, target: 'broken', icon: Link2Off },
    { phrase: `${formatCount(duplicates)} 条重复书签`, hint: '同一个网址收藏了不止一次', count: duplicates, target: 'duplicates', icon: Copy },
    { phrase: `${formatCount(health.redirected)} 个网址已搬家`, hint: '网站换了新地址，可以一键更新', count: health.redirected, target: 'redirected', icon: CornerUpRight },
    { phrase: `${formatCount(health.pending)} 个链接待确认`, hint: '暂时判断不了，需要你看一眼', count: health.pending, target: 'pending', icon: CircleHelp },
    { phrase: `${formatCount(health.unscanned)} 个书签还没检查`, hint: '检查一遍才知道哪些已经失效', count: health.unscanned, target: 'scan', icon: Activity },
  ];
  const openTasks = tasks.filter((t) => t.count > 0);
  const tiles = useMemo(() => folderTiles(roots, index.countByFolder, SHELF_BOOK_LIMIT), [roots, index]);

  // 一屏完成：统计卡一行，下面书架与右侧两块面板等高，长内容在面板内滚动
  return (
    <div className="flex h-full min-h-[640px] flex-col gap-4 px-6 py-5">
      <PageHeader
        title="总览"
        subtitle={`共 ${formatCount(index.bookmarks.length)} 个书签、${formatCount(index.folderCount)} 个文件夹，所有改动都能在「操作记录」里撤销。`}
        actions={
          <>
            <Button variant="outline" onClick={() => onNavigate('scan')}>
              <Activity />
              健康扫描
            </Button>
            <Button onClick={() => onNavigate('organize')}>
              <Sparkles />
              智能整理
            </Button>
          </>
        }
      />

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="书签"
          icon={BookmarkIcon}
          value={index.bookmarks.length}
          detail={<span className="text-xs text-muted-foreground tabular-nums">{formatCount(index.folderCount)} 个文件夹</span>}
        />
        <StatCard label="健康度" icon={ShieldCheck} value={score} detail={<Pill tone={level.tone}>{level.label}</Pill>} onClick={() => onNavigate('scan')} />
        <StatCard
          label="失效链接"
          icon={Link2Off}
          value={health.broken}
          detail={health.broken > 0 ? <Pill tone="danger">去处理</Pill> : <Pill>无</Pill>}
          onClick={() => onNavigate('broken')}
        />
        <StatCard
          label="重复书签"
          icon={Copy}
          value={duplicates}
          detail={duplicates > 0 ? <Pill tone="warn">去清理</Pill> : <Pill>无</Pill>}
          onClick={() => onNavigate('duplicates')}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="书签分布" meta={`${tiles.length} 个目录`} className="min-h-72">
          <Bookshelf tiles={tiles} roots={roots} countByFolder={index.countByFolder} onOpenFolder={onOpenFolder} />
        </Panel>

        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="待办" meta={openTasks.length > 0 ? `${openTasks.length} 项` : undefined} className="shrink-0">
            {openTasks.length === 0 ? (
              <div className="flex items-center gap-4 p-4">
                <Lighthouse className="h-14 w-auto shrink-0" />
                <div>
                  <p className="text-sm font-medium">一切正常</p>
                  <p className="text-xs text-muted-foreground">没有失效、重复或待确认的书签。</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {openTasks.map((t) => (
                  <li key={t.target}>
                    <button
                      type="button"
                      onClick={() => onNavigate(t.target)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <t.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium tabular-nums">{t.phrase}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.hint}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="常去的网站" meta="按收藏数量" className="flex-1" bodyClassName="overflow-auto">
            {domains.length > 0 ? (
              <ol className="divide-y">
                {domains.map((d) => (
                  <li key={d.domain} className="flex items-center gap-3 px-4 py-2">
                    <Favicon url={`https://${d.domain}/`} name={d.domain} className="size-5 rounded" />
                    <span className="min-w-0 flex-1 truncate text-sm">{d.domain}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatCount(d.count)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">还没有网页书签。</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
