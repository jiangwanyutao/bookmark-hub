import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Activity, CircleDashed, CircleHelp, Copy, CornerUpRight, FolderX, Link2Off, ShieldCheck, Sparkles } from 'lucide-react';
import { topDomains, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { folderTiles } from '@/lib/treemap';
import { findDuplicateGroups, redundantCount } from '@/lib/duplicates';
import { healthScore, isUncategorized } from '@/lib/health';
import { findEmptyFolders } from '@/lib/emptyFolders';
import { summarizeHealth } from '@/lib/scan/scanner';
import { useScanResults } from '@/hooks/useScanResults';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Lighthouse } from './brand/Lighthouse';
import { Bookshelf } from './Bookshelf';
import { CountUp } from './CountUp';
import { DistributionBars } from './DistributionBars';
import { EmptyFoldersDialog } from './EmptyFoldersDialog';
import { Favicon } from './Favicon';
import { PageHeader, pageLayout } from './PageHeader';
import { Panel } from './Panel';
import { Pill, type PillTone } from './Pill';

const TOP_DOMAIN_LIMIT = 10;
const SHELF_BOOK_LIMIT = 12;
// 健康度分档：≥ 80 良好，≥ 50 一般，其余较差
const HEALTH_GOOD = 80;
const HEALTH_FAIR = 50;
// 分档轨道：三段颜色与分档一致
const HEALTH_TRACK = `linear-gradient(to right,
  color-mix(in srgb, var(--coral) 78%, var(--card)) 0 ${HEALTH_FAIR}%,
  color-mix(in srgb, var(--warn) 90%, var(--card)) ${HEALTH_FAIR}% ${HEALTH_GOOD}%,
  color-mix(in srgb, var(--primary) 34%, var(--card)) ${HEALTH_GOOD}% 100%)`;

const formatCount = (n: number) => n.toLocaleString('zh-CN');

type Target = 'scan' | 'broken' | 'duplicates' | 'redirected' | 'pending' | 'organize';
type Icon = ComponentType<{ className?: string }>;
type DistView = 'bars' | 'shelf';

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  barId: string;
  onNavigate: (target: Target) => void;
  onOpenFolder: (folderId: string) => void;
}

const CARD = 'rounded-xl border bg-card p-4 text-left shadow-card';
const CARD_BUTTON = 'outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:translate-y-px';

function StatCard({ label, icon: Icon, value, detail, onClick }: { label: string; icon: Icon; value: number; detail: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(CARD, CARD_BUTTON, 'flex items-center gap-3')}>
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
    </button>
  );
}

/** 健康度卡：分数 + 分档轨道 + 一句扣分原因。 */
function HealthCard({ score, level, note, onClick }: { score: number; level: { label: string; tone: PillTone }; note: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(CARD, CARD_BUTTON, 'flex flex-col gap-2.5')}>
      <span className="flex w-full items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ShieldCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">健康度</span>
          <span className="block text-2xl leading-tight font-semibold tabular-nums">
            <CountUp value={score} />
          </span>
        </span>
        <Pill tone={level.tone}>{level.label}</Pill>
      </span>
      <span aria-hidden className="relative block h-2 w-full rounded-full" style={{ background: HEALTH_TRACK }}>
        <span
          className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-xs bg-foreground shadow-[0_0_0_2px_var(--card)]"
          style={{ left: `${score}%` }}
        />
      </span>
      <span aria-hidden className="flex w-full justify-between text-xs text-muted-foreground">
        <span>较差</span>
        <span>一般</span>
        <span>良好</span>
      </span>
      <span className="block text-xs text-pretty text-muted-foreground">{note}</span>
    </button>
  );
}

const Strong = ({ children }: { children: ReactNode }) => <b className="font-semibold text-foreground tabular-nums">{children}</b>;

/** 扣分原因：取数量最多的一类问题，再补一句还没检查的数量。 */
function healthNote(causes: { label: string; count: number }[], unscanned: number): ReactNode {
  const main = [...causes].sort((a, b) => b.count - a.count).find((c) => c.count > 0);
  const rest = unscanned > 0 && (
    <>
      ，另有 <Strong>{formatCount(unscanned)} 个书签</Strong>还没检查
    </>
  );
  return main ? (
    <>
      扣分主要来自 <Strong>{main.label}</Strong>
      {rest}。
    </>
  ) : (
    <>暂无明显问题{rest}。</>
  );
}

// 分段控件：选中段用主色实底
const segment = (isActive: boolean) =>
  cn(
    'rounded-md px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
    isActive ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
  );

export function Overview({ index, roots, barId, onNavigate, onOpenFolder }: Props) {
  const { results, ignored } = useScanResults();
  const domains = topDomains(index.bookmarks, TOP_DOMAIN_LIMIT);
  const [distView, setDistView] = useState<DistView>('bars');
  const [cleaning, setCleaning] = useState(false);
  const emptyFolders = useMemo(() => findEmptyFolders(roots), [roots]);
  // 列表里一项可能连带删掉里面的空子目录，待办上报实际会消失的个数
  const emptyFolderCount = emptyFolders.reduce((sum, f) => sum + f.folderCount, 0);

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
  const note = healthNote(
    [
      { label: `${formatCount(health.broken)} 个失效链接`, count: health.broken },
      { label: `${formatCount(duplicates)} 条重复书签`, count: duplicates },
      { label: `${formatCount(health.redirected)} 个网址已搬家`, count: health.redirected },
      { label: `${formatCount(uncategorized)} 个书签没归类`, count: uncategorized },
    ],
    health.unscanned,
  );

  // target 与 onAction 二选一：大多数待办跳到对应页面，空文件夹就地弹确认框
  const tasks: { phrase: string; hint: string; action: string; count: number; target?: Target; icon: Icon; onAction?: () => void }[] = [
    {
      phrase: `${formatCount(emptyFolderCount)} 个空文件夹`,
      hint: '里面一个书签都没有，可以删掉',
      action: '去清理',
      count: emptyFolderCount,
      icon: FolderX,
      onAction: () => setCleaning(true),
    },
    { phrase: `${formatCount(health.broken)} 个失效链接`, hint: '网页已经打不开，可以删除或忽略', action: '去处理', count: health.broken, target: 'broken', icon: Link2Off },
    { phrase: `${formatCount(duplicates)} 条重复书签`, hint: '同一个网址收藏了不止一次', action: '去清理', count: duplicates, target: 'duplicates', icon: Copy },
    { phrase: `${formatCount(health.redirected)} 个网址已搬家`, hint: '网站换了新地址，可以一键更新', action: '一键更新', count: health.redirected, target: 'redirected', icon: CornerUpRight },
    { phrase: `${formatCount(health.pending)} 个链接待确认`, hint: '暂时判断不了，需要你看一眼', action: '去看看', count: health.pending, target: 'pending', icon: CircleHelp },
    { phrase: `${formatCount(health.unscanned)} 个书签还没检查`, hint: '检查一遍才知道哪些已经失效', action: '开始扫描', count: health.unscanned, target: 'scan', icon: Activity },
  ];
  const openTasks = tasks.filter((t) => t.count > 0);
  const tiles = useMemo(() => folderTiles(roots, index.countByFolder, SHELF_BOOK_LIMIT), [roots, index]);

  // 一屏完成：统计卡一行，下面分布面板与右侧两块等分面板等高，长内容在面板内滚动
  return (
    <div className={pageLayout('min-h-[640px]')}>
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

      {/* 四张卡都是「需要你行动」的数字；书签总数已在副标题里 */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <HealthCard score={score} level={level} note={note} onClick={() => onNavigate('scan')} />
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
        <StatCard
          label="还没检查"
          icon={CircleDashed}
          value={health.unscanned}
          detail={health.unscanned > 0 ? <Pill>去扫描</Pill> : <Pill>无</Pill>}
          onClick={() => onNavigate('scan')}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="书签分布"
          meta={`${tiles.length} 个目录`}
          actions={
            <div role="group" aria-label="分布视图" className="inline-flex rounded-lg bg-muted p-0.5">
              <button type="button" aria-pressed={distView === 'bars'} className={segment(distView === 'bars')} onClick={() => setDistView('bars')}>
                条形
              </button>
              <button type="button" aria-pressed={distView === 'shelf'} className={segment(distView === 'shelf')} onClick={() => setDistView('shelf')}>
                书架
              </button>
            </div>
          }
          className="min-h-72"
        >
          {distView === 'bars' ? (
            <DistributionBars tiles={tiles} roots={roots} countByFolder={index.countByFolder} onOpenFolder={onOpenFolder} />
          ) : (
            <Bookshelf tiles={tiles} roots={roots} countByFolder={index.countByFolder} onOpenFolder={onOpenFolder} />
          )}
        </Panel>

        {/* 右栏两块面板等分高度，内容多时各自滚动 */}
        <div className="flex min-h-0 flex-col gap-4">
          <Panel
            title="需要处理"
            meta={openTasks.length > 0 ? `${openTasks.length} 项` : undefined}
            className="flex-1"
            bodyClassName="overflow-auto"
          >
            {openTasks.length === 0 ? (
              <div className="flex items-center gap-4 p-4">
                <Lighthouse className="h-14 w-auto shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">一切正常</p>
                  <p className="text-xs text-muted-foreground">没有失效、重复或待确认的书签。</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => onNavigate('scan')}>
                  再扫描一遍
                </Button>
              </div>
            ) : (
              <ul className="flex h-full flex-col divide-y">
                {openTasks.map((t) => (
                  // 待办少时行不无限拉高，停在上方
                  <li key={t.phrase} className="flex max-h-14 min-h-11 flex-1 items-center gap-3 px-4 py-1.5">
                    <t.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium tabular-nums">{t.phrase}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.hint}</span>
                    </span>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={t.onAction ?? (() => t.target && onNavigate(t.target))}>
                      {t.action}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="常去的网站" meta="按收藏数量" className="flex-1" bodyClassName="overflow-auto">
            {domains.length > 0 ? (
              <ol className="flex h-full flex-col divide-y">
                {domains.map((d) => (
                  <li key={d.domain} className="flex min-h-5.5 flex-1 items-center gap-2.5 px-4">
                    <Favicon url={`https://${d.domain}/`} name={d.domain} className="size-4.5 rounded" />
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

      <EmptyFoldersDialog folders={emptyFolders} open={cleaning} onOpenChange={setCleaning} />
    </div>
  );
}
