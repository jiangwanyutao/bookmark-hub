import type { ComponentType } from 'react';
import { CircleCheck, CircleHelp, CircleMinus, Clock, CornerUpRight, Link2Off, Pause, Play, RotateCcw, ShieldCheck, WifiOff } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { useScan } from '@/hooks/useScan';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Lighthouse } from './brand/Lighthouse';

const formatCount = (n: number) => n.toLocaleString('zh-CN');

type Icon = ComponentType<{ className?: string }>;
type StatusKey = 'healthy' | 'redirected' | 'broken' | 'pending' | 'skipped' | 'unscanned';

// 状态颜色只上在图标芯片和分段条上，旁边总有文字和数字
const STATUS: { key: StatusKey; label: string; hint: string; icon: Icon; chip: string; bar: string }[] = [
  { key: 'healthy', label: '正常', hint: '能正常打开', icon: CircleCheck, chip: 'bg-accent text-accent-foreground', bar: 'bg-primary' },
  {
    key: 'redirected',
    label: '网址已搬家',
    hint: '永久跳转到了新地址',
    icon: CornerUpRight,
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    bar: 'bg-amber-500',
  },
  { key: 'broken', label: '失效', hint: '网页已经打不开', icon: Link2Off, chip: 'bg-coral text-coral-foreground', bar: 'bg-destructive' },
  { key: 'pending', label: '待确认', hint: '可能需要登录、被限流或需要 VPN', icon: CircleHelp, chip: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/60' },
  { key: 'skipped', label: '已跳过', hint: '内网地址和带登录凭据的链接', icon: CircleMinus, chip: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/30' },
  { key: 'unscanned', label: '还没检查', hint: '扫描后才知道状态', icon: Clock, chip: 'bg-muted text-muted-foreground', bar: 'bg-border' },
];

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

  return (
    <section className="mx-auto max-w-4xl p-8">
      <div className="grid items-end gap-6 overflow-hidden rounded-2xl bg-accent px-8 pt-8 text-accent-foreground md:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="space-y-3 pb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground tabular-nums">{headline}</h1>
          <p className="text-sm">检查每个书签能否打开。请求不带你的登录信息，内网地址和带登录凭据的链接不会被请求。</p>

          {progress && (running || phase === 'offline') && (
            <div className="max-w-md space-y-2 pt-1">
              <div
                role="progressbar"
                aria-label="扫描进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                className="h-2 overflow-hidden rounded-full bg-card"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs tabular-nums">
                本次 {formatCount(progress.counts.healthy)} 正常 · {formatCount(progress.counts.redirected)} 搬家 ·{' '}
                {formatCount(progress.counts.broken)} 失效 · {formatCount(progress.counts.suspicious + progress.counts.unknown)} 待确认
              </p>
              <p className="text-xs">
                {progress.networkMode === 'restricted' ? '无法访问境外网站，网络错误会标为「可能需要 VPN」' : '网络正常'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {running ? (
              <>
                <Button onClick={pause}>
                  <Pause />
                  暂停
                </Button>
                <Button variant="outline" onClick={() => void cancel()}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => void start()}>
                  <Play />
                  {resumable ? '继续扫描' : '扫描书签'}
                </Button>
                {resumable && (
                  <Button variant="outline" onClick={() => void cancel()}>
                    <RotateCcw />
                    放弃本次进度
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        <Lighthouse beam className="-mr-4 hidden h-36 w-auto self-end md:block" />
      </div>

      {permitted === false && (
        <p className="mt-6 flex gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          第一次扫描时会请你授权「访问网站」，用来检查书签能否打开。拒绝后除扫描外的功能都能照常使用。
        </p>
      )}

      {phase === 'offline' && (
        <p className="mt-6 flex gap-2 rounded-xl bg-coral px-4 py-3 text-sm text-coral-foreground">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          网络不可用，扫描已暂停。恢复网络后点「继续扫描」，断网期间的结果不会被记录。
        </p>
      )}

      <div className="mt-10">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-base font-semibold">书签状态</h2>
          <span className="text-xs text-muted-foreground tabular-nums">共 {formatCount(total)} 个</span>
        </div>
        {/* 分段条只做概览，具体数字见下方清单 */}
        <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {STATUS.filter((s) => summary[s.key] > 0).map((s) => (
            <div key={s.key} className={cn('min-w-1', s.bar)} style={{ flex: `${summary[s.key]} 1 0` }} />
          ))}
        </div>
        <ul className="mt-5 grid gap-x-8 sm:grid-cols-2">
          {STATUS.map((s) => (
            <li key={s.key} className="flex items-center gap-3 border-b py-3">
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', s.chip)}>
                <s.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <span className="text-lg font-semibold tabular-nums">{formatCount(summary[s.key])}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
