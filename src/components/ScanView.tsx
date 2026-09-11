import { Pause, Play, RotateCcw, ShieldCheck, WifiOff } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { useScan } from '@/hooks/useScan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const formatCount = (n: number) => n.toLocaleString('zh-CN');

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={cn('text-2xl font-semibold tabular-nums', tone)}>{formatCount(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const TONE = {
  healthy: 'text-emerald-600 dark:text-emerald-400',
  redirected: 'text-amber-600 dark:text-amber-400',
  broken: 'text-destructive',
};

export function ScanView({ bookmarks }: { bookmarks: Bookmark[] }) {
  const { phase, progress, permitted, resumable, summary, start, pause, cancel } = useScan(bookmarks);
  const running = phase === 'running';
  const percent = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">健康扫描</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          检查每个书签能否打开。请求不带你的登录信息；内网地址和带登录凭据的链接不会被请求。
        </p>
      </div>

      {permitted === false && (
        <p className="flex gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          第一次扫描时会请你授权「访问网站」，用来检查书签能否打开。拒绝后除扫描外的功能都能照常使用。
        </p>
      )}

      {phase === 'offline' && (
        <p className="flex gap-2 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          网络不可用，扫描已暂停。恢复网络后点「继续扫描」，断网期间的结果不会被记录。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {running ? (
          <>
            <Button variant="outline" onClick={pause}>
              <Pause />
              暂停
            </Button>
            <Button variant="ghost" onClick={() => void cancel()}>
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
              <Button variant="ghost" onClick={() => void cancel()}>
                <RotateCcw />
                放弃本次进度
              </Button>
            )}
          </>
        )}
      </div>

      {progress && (running || phase === 'offline') && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base tabular-nums">
              {running ? '正在扫描' : '已暂停'} {formatCount(progress.done)} / {formatCount(progress.total)}
            </CardTitle>
            {progress.networkMode === 'restricted' ? (
              <Badge variant="outline">无法访问境外网站，网络错误将标为「可能需要 VPN」</Badge>
            ) : (
              <Badge variant="secondary">网络正常</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percent} aria-label="扫描进度" />
            <div className="grid grid-cols-4 gap-4">
              <Stat label="正常" value={progress.counts.healthy} tone={TONE.healthy} />
              <Stat label="重定向" value={progress.counts.redirected} tone={TONE.redirected} />
              <Stat label="失效" value={progress.counts.broken} tone={TONE.broken} />
              <Stat label="待确认" value={progress.counts.suspicious + progress.counts.unknown} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">全部书签</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-6 sm:grid-cols-6">
          <Stat label="正常" value={summary.healthy} tone={TONE.healthy} />
          <Stat label="重定向" value={summary.redirected} tone={TONE.redirected} />
          <Stat label="失效" value={summary.broken} tone={TONE.broken} />
          <Stat label="待确认" value={summary.pending} />
          <Stat label="已跳过" value={summary.skipped} />
          <Stat label="未扫描" value={summary.unscanned} />
        </CardContent>
      </Card>
    </section>
  );
}
