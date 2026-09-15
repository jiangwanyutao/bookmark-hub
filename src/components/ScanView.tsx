import type { ComponentType } from 'react';
import { CircleCheck, CircleHelp, CircleMinus, Clock, CornerUpRight, Link2Off, Pause, Play, RotateCcw, ShieldCheck, WifiOff } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { useScan } from '@/hooks/useScan';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CountUp } from './CountUp';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';
import { Pill } from './Pill';

const formatCount = (n: number) => n.toLocaleString('zh-CN');

type Icon = ComponentType<{ className?: string }>;
type StatusKey = 'healthy' | 'redirected' | 'broken' | 'pending' | 'skipped' | 'unscanned';

// fill 是分段条的实心填充（要表达比例）；mark 是小圆点，三种灰态靠形状区分：空心圈 / 实心点 / 虚线圈
const STATUS: { key: StatusKey; label: string; hint: string; icon: Icon; fill: string; mark: string; iconBg?: string }[] = [
  { key: 'healthy', label: '正常', hint: '能正常打开', icon: CircleCheck, fill: 'bg-primary', mark: 'bg-primary' },
  { key: 'redirected', label: '网址已搬家', hint: '永久跳转到了新地址', icon: CornerUpRight, fill: 'bg-warn-indicator', mark: 'bg-warn-indicator' },
  { key: 'broken', label: '失效', hint: '网页已经打不开', icon: Link2Off, fill: 'bg-destructive', mark: 'bg-destructive' },
  {
    key: 'pending',
    label: '待确认',
    hint: '可能需要登录、被限流或需要 VPN',
    icon: CircleHelp,
    fill: 'bg-warn-indicator/60',
    mark: 'border-[1.5px] border-warn-indicator',
    iconBg: 'bg-warn text-warn-foreground',
  },
  { key: 'skipped', label: '已跳过', hint: '内网地址和带登录凭据的链接', icon: CircleMinus, fill: 'bg-muted-foreground/40', mark: 'bg-muted-foreground/50' },
  { key: 'unscanned', label: '还没检查', hint: '扫描后才知道状态', icon: Clock, fill: 'bg-border', mark: 'border border-dashed border-muted-foreground' },
];

// 占比小的段也要看得清颜色；比例因此失真，准确数字看图例
const MIN_SEGMENT = 'min-w-[26px]';

export function ScanView({ bookmarks }: { bookmarks: Bookmark[] }) {
  const { phase, progress, permitted, resumable, summary, start, pause, cancel } = useScan(bookmarks);
  const running = phase === 'running';
  const percent = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const total = STATUS.reduce((sum, s) => sum + summary[s.key], 0);

  const headline =
    running && progress
      ? `正在检查第 ${formatCount(progress.done)} / ${formatCount(progress.total)} 个`
      : phase === 'offline'
        ? '网络断开了，扫描已暂停'
        : resumable
          ? '上次的检查还没做完'
          : summary.unscanned === total
            ? `${formatCount(total)} 个书签还没检查过`
            : summary.unscanned > 0
              ? `还有 ${formatCount(summary.unscanned)} 个书签没检查`
              : '所有书签都检查过了';

  const actions = running ? (
    <>
      <Button variant="outline" onClick={() => void cancel()}>
        取消
      </Button>
      <Button onClick={pause}>
        <Pause />
        暂停
      </Button>
    </>
  ) : (
    <>
      {resumable && (
        <Button variant="outline" onClick={() => void cancel()}>
          <RotateCcw />
          放弃本次进度
        </Button>
      )}
      <Button onClick={() => void start()}>
        <Play />
        {resumable ? '继续扫描' : '扫描书签'}
      </Button>
    </>
  );

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4 px-6 py-5">
      <PageHeader title="健康扫描" subtitle="检查每个书签能否打开。请求不带你的登录信息，内网地址和带登录凭据的链接不会被请求。" actions={actions} />

      {permitted === false && (
        <p className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          第一次扫描时会请你授权「访问网站」，用来检查书签能否打开。拒绝后除扫描外的功能都能照常使用。
        </p>
      )}
      {phase === 'offline' && (
        <p className="flex shrink-0 items-center gap-2 rounded-xl bg-coral px-4 py-2.5 text-sm text-coral-foreground">
          <WifiOff className="size-4 shrink-0" />
          网络不可用，扫描已暂停。恢复网络后点「继续扫描」，断网期间的结果不会被记录。
        </p>
      )}

      {/* 面板保持自然高度：撑满余高时中间是一大块空白，比页面底部留白更显空 */}
      <Panel
        title="书签健康"
        meta={headline}
        actions={
          progress && (running || phase === 'offline') ? (
            <Pill tone={progress.networkMode === 'restricted' ? 'warn' : 'ok'}>
              {progress.networkMode === 'restricted' ? '无法访问境外网站' : '网络正常'}
            </Pill>
          ) : undefined
        }
        className="shrink-0"
        bodyClassName="flex flex-wrap items-center gap-x-8 gap-y-4 p-5"
      >
        <div className="flex shrink-0 flex-col">
          <span className="text-4xl leading-none font-semibold tabular-nums">{formatCount(summary.unscanned)}</span>
          <span className="mt-2 text-sm text-muted-foreground">还没检查</span>
          <span className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            共 {formatCount(total)} 个 · 已检查 {formatCount(total - summary.unscanned)} 个
          </span>
        </div>

        <div className="flex min-w-64 flex-1 flex-col gap-3">
          {progress && (running || phase === 'offline') && (
            <div className="space-y-1.5">
              <div
                role="progressbar"
                aria-label="扫描进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                本次 {formatCount(progress.counts.healthy)} 正常 · {formatCount(progress.counts.redirected)} 搬家 · {formatCount(progress.counts.broken)} 失效 ·{' '}
                {formatCount(progress.counts.suspicious + progress.counts.unknown)} 待确认
              </p>
            </div>
          )}
          <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {STATUS.filter((s) => summary[s.key] > 0).map((s) => (
              <div key={s.key} title={`${s.label} ${formatCount(summary[s.key])}`} className={cn(MIN_SEGMENT, s.fill)} style={{ flex: `${summary[s.key]} 1 0` }} />
            ))}
          </div>
          <ul aria-label="各状态数量" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {STATUS.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-2.5 rounded-full', s.mark)} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className={cn('tabular-nums', summary[s.key] === 0 ? 'text-muted-foreground' : 'font-semibold')}>{formatCount(summary[s.key])}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* 0 值的卡退到背景：数字变细变灰，不降整卡透明度（文字对比度要够） */}
      <ul className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STATUS.map((s) => {
          const empty = summary[s.key] === 0;
          return (
            <li
              key={s.key}
              className={cn('flex items-center gap-3 rounded-xl border bg-card p-4 shadow-card', s.key === 'unscanned' && !empty && 'border-dashed')}
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', s.iconBg ?? 'bg-muted text-muted-foreground')}>
                <s.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span aria-hidden className={cn('size-2.5 rounded-full', s.mark)} />
                  {s.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <span className={cn('text-2xl tabular-nums', empty ? 'font-normal text-muted-foreground' : 'font-semibold')}>
                <CountUp value={summary[s.key]} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
