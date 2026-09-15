import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, CircleCheck, EyeOff, ExternalLink, Globe, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { hostOf, type FailReason } from '@/lib/scan/classify';
import { collectIssues, FAIL_REASON_LABEL, type Issue, type IssueKind } from '@/lib/scan/issues';
import { addVpnHosts, recheckUrls, setIgnored } from '@/lib/scan/scanner';
import { browserScanDeps, ensureScanAccess } from '@/lib/scan/request';
import { getHubCtx } from '@/lib/hubContext';
import { runBatch } from '@/lib/actions';
import { useScanResults } from '@/hooks/useScanResults';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Lighthouse } from './brand/Lighthouse';
import { Favicon } from './Favicon';
import { PageHeader, pageLayout } from './PageHeader';
import { Panel } from './Panel';
import { Pill, type PillTone } from './Pill';

type BookmarkIssue = Issue<Bookmark>;

const CONFIG: Record<
  IssueKind,
  { title: string; description: string; empty: string; tone: PillTone; defaultSelect: (i: BookmarkIssue) => boolean }
> = {
  broken: {
    title: '失效链接',
    description: '「域名无法解析」可能是公司内网或需要 VPN 的网站，默认不勾选，连上后可以重新检测。',
    empty: '没有失效链接。',
    tone: 'danger',
    defaultSelect: (i) => i.result.failReason === 'not_found',
  },
  redirected: {
    title: '重定向链接',
    description: '这些网址已永久迁移到新地址。更新后可以在「操作记录」里撤销。',
    empty: '没有需要更新的网址。',
    tone: 'warn',
    defaultSelect: () => true,
  },
  pending: {
    title: '待确认',
    description: '可能需要登录、被限流、网站暂时故障，或需要 VPN。连上 VPN 或登录后可以重新检测。',
    empty: '没有待确认的链接。',
    tone: 'neutral',
    defaultSelect: () => false,
  },
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const uniqueUrls = (issues: BookmarkIssue[]) => [...new Set(issues.map((i) => i.bookmark.url))];

export function IssuesView({ kind, bookmarks }: { kind: IssueKind; bookmarks: Bookmark[] }) {
  const config = CONFIG[kind];
  const { results, ignored, reload } = useScanResults();
  const { active, ignored: ignoredIssues } = useMemo(
    () => collectIssues(bookmarks, results, ignored, kind),
    [bookmarks, results, ignored, kind],
  );
  const [reasonFilter, setReasonFilter] = useState<FailReason | 'all'>('all');
  // null 表示用户还没动过勾选，用默认规则
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const shown = reasonFilter === 'all' ? active : active.filter((i) => i.result.failReason === reasonFilter);
  const selection = picked ?? new Set(shown.filter(config.defaultSelect).map((i) => i.bookmark.id));
  const selected = shown.filter((i) => selection.has(i.bookmark.id));
  const allChecked = shown.length > 0 && selected.length === shown.length;

  const reasonCounts = new Map<FailReason, number>();
  for (const i of active) {
    if (i.result.failReason) reasonCounts.set(i.result.failReason, (reasonCounts.get(i.result.failReason) ?? 0) + 1);
  }

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selection);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  // 行内单条操作不重置勾选，免得打乱正在挑的批量选择
  async function withBusy(work: () => Promise<void>, resetSelection = true) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(`操作失败：${errorMessage(e)}`);
    } finally {
      setBusy(false);
      if (resetSelection) setPicked(null);
      await reload();
    }
  }

  async function recheck(issues: BookmarkIssue[], resetSelection = true) {
    // 授权须在点击后第一时间请求
    const access = await ensureScanAccess();
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问网站的权限，无法检测。');
      return;
    }
    await withBusy(async () => {
      const { db } = await getHubCtx();
      const outcome = await recheckUrls(browserScanDeps(db), uniqueUrls(issues));
      if (outcome === 'offline') toast.error('网络不可用，请恢复网络后再试。');
      else toast.success(`已重新检测 ${issues.length} 个书签`);
    }, resetSelection);
  }

  const ignore = (issues: BookmarkIssue[], on: boolean, resetSelection = true) =>
    withBusy(async () => {
      const { db } = await getHubCtx();
      await setIgnored(db, uniqueUrls(issues), on, Date.now());
      toast.success(on ? `已忽略 ${issues.length} 条` : `已取消忽略 ${issues.length} 条`);
    }, resetSelection);

  const markVpn = (issues: BookmarkIssue[]) =>
    withBusy(async () => {
      const { db } = await getHubCtx();
      const hosts = [...new Set(issues.map((i) => hostOf(i.bookmark.url)))];
      const moved = await addVpnHosts(db, hosts, Date.now());
      toast.success(`已将 ${hosts.length} 个网站标记为需要 VPN${moved > 0 ? `，${moved} 条结果已移到「待确认」` : ''}`);
    });

  const remove = (issues: BookmarkIssue[]) =>
    withBusy(async () => {
      await runBatch(
        kind === 'broken' ? '删除失效书签' : '删除书签',
        issues.map((i) => ({ type: 'remove', id: i.bookmark.id })),
        `已删除 ${issues.length} 个书签`,
      );
    });

  const updateUrls = (issues: BookmarkIssue[]) =>
    withBusy(async () => {
      const targets = issues.filter((i) => i.result.redirectTo);
      const ok = await runBatch(
        '更新重定向网址',
        targets.map((i) => ({ type: 'update', id: i.bookmark.id, url: i.result.redirectTo! })),
        `已更新 ${targets.length} 个网址`,
      );
      if (!ok) return;
      // 扫描时新地址已返回 2xx，直接记为正常，免得更新后显示「未扫描」
      const { db } = await getHubCtx();
      await Promise.all(
        targets.map((i) =>
          db.put('scanResults', { ...i.result, url: i.result.redirectTo!, health: 'healthy', failReason: null, redirectTo: null }),
        ),
      );
    });

  if (results.size === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Lighthouse className="h-24 w-auto" />
        <div className="space-y-1">
          <p className="font-medium">还没有扫描过</p>
          <p className="max-w-xs text-sm text-muted-foreground">去「健康扫描」开始第一次扫描，结果会显示在这里。</p>
        </div>
      </div>
    );
  }

  // 分段控件：选中段用主色实底
  const segment = (isActive: boolean) =>
    cn(
      'rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
      isActive ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
    );

  const filter =
    kind === 'pending' && reasonCounts.size > 1 ? (
      <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="按原因筛选">
        <button
          type="button"
          aria-pressed={reasonFilter === 'all'}
          className={segment(reasonFilter === 'all')}
          onClick={() => {
            setReasonFilter('all');
            setPicked(null);
          }}
        >
          全部 <span className="tabular-nums">{active.length}</span>
        </button>
        {[...reasonCounts].map(([reason, count]) => (
          <button
            key={reason}
            type="button"
            aria-pressed={reasonFilter === reason}
            className={segment(reasonFilter === reason)}
            onClick={() => {
              setReasonFilter(reason);
              setPicked(null);
            }}
          >
            {FAIL_REASON_LABEL[reason]} <span className="tabular-nums">{count}</span>
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <div className={pageLayout()}>
      <PageHeader title={config.title} subtitle={`共 ${active.length} 条。${config.description}`} actions={filter} />

      {shown.length === 0 ? (
        <Panel className="shrink-0" bodyClassName="flex items-center gap-3 p-5 text-sm">
          <CircleCheck className="size-5 shrink-0 text-primary" />
          {config.empty}
        </Panel>
      ) : (
        <Panel className="flex-1" bodyClassName="flex flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
            <Checkbox
              id={`select-all-${kind}`}
              aria-label="全选"
              checked={allChecked ? true : selected.length > 0 ? 'indeterminate' : false}
              onCheckedChange={(on) => setPicked(new Set(on === true ? shown.map((i) => i.bookmark.id) : []))}
            />
            <span className="mr-auto text-sm text-muted-foreground tabular-nums">
              已选 {selected.length} / {shown.length}
            </span>
            <Button size="sm" variant="outline" disabled={busy || selected.length === 0} onClick={() => void recheck(selected)}>
              <RefreshCw />
              重新检测
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || selected.length === 0} onClick={() => void ignore(selected, true)}>
              <EyeOff />
              忽略
            </Button>
            {kind !== 'redirected' && (
              <Button size="sm" variant="ghost" disabled={busy || selected.length === 0} onClick={() => void markVpn(selected)}>
                <Globe />
                需要 VPN
              </Button>
            )}
            {kind === 'redirected' ? (
              <Button size="sm" disabled={busy || selected.length === 0} onClick={() => void updateUrls(selected)}>
                <Wand2 />
                更新网址
              </Button>
            ) : (
              <Button
                size="sm"
                variant={kind === 'broken' ? 'destructive' : 'outline'}
                disabled={busy || selected.length === 0}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                删除
              </Button>
            )}
          </div>
          {/* 列表只在面板内滚动，操作栏始终可见 */}
          <ul className="min-h-0 flex-1 divide-y overflow-auto">
            {shown.map((issue) => (
              <IssueRow
                key={issue.bookmark.id}
                issue={issue}
                tone={config.tone}
                checked={selection.has(issue.bookmark.id)}
                onCheckedChange={(on) => toggle(issue.bookmark.id, on)}
                busy={busy}
                onRecheck={() => void recheck([issue], false)}
                onIgnore={() => void ignore([issue], true, false)}
              />
            ))}
          </ul>
        </Panel>
      )}

      {ignoredIssues.length > 0 && (
        <details className="group shrink-0 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-card">
          <summary className="flex items-center gap-1.5 text-muted-foreground">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            已忽略 {ignoredIssues.length} 条
            <span className="ml-auto text-xs">这些不会再出现在上面的列表里</span>
          </summary>
          <ul className="mt-2 max-h-40 divide-y overflow-auto">
            {ignoredIssues.map((issue) => (
              <li key={issue.bookmark.id} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0 truncate">{issue.bookmark.title || issue.bookmark.url}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void ignore([issue], false)}>
                  取消忽略
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {selected.length} 个书签？</AlertDialogTitle>
            <AlertDialogDescription>
              删除前会自动创建恢复点，可以在「操作记录」里撤销。开启了 Chrome 同步时，删除会同步到你的其他设备。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove(selected)}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IssueRow({
  issue,
  tone,
  checked,
  onCheckedChange,
  busy,
  onRecheck,
  onIgnore,
}: {
  issue: BookmarkIssue;
  tone: PillTone;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  busy: boolean;
  onRecheck: () => void;
  onIgnore: () => void;
}) {
  const { bookmark, result } = issue;
  const id = `issue-${bookmark.id}`;
  const name = bookmark.title || bookmark.url;
  return (
    <li className="group flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
      <Checkbox id={id} className="mt-1" checked={checked} onCheckedChange={(on) => onCheckedChange(on === true)} />
      <Favicon key={bookmark.id} url={bookmark.url} name={bookmark.title || bookmark.url} className="mt-0.5 size-5 rounded" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
        <span className="block truncate text-sm font-medium">{bookmark.title || bookmark.url}</span>
        {/* 网址单行截断，行高整齐；完整网址悬停可见 */}
        <span className="block truncate font-mono text-xs text-muted-foreground" title={bookmark.url}>
          {bookmark.url}
        </span>
        {result.redirectTo && (
          <span className="block truncate text-xs text-primary" title={result.redirectTo}>
            → {result.redirectTo}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          {result.failReason && (
            <Pill tone={tone}>
              {FAIL_REASON_LABEL[result.failReason]}
              {result.httpStatus ? `（${result.httpStatus}）` : ''}
            </Pill>
          )}
          <span>{bookmark.folderPath}</span>
          <span>· {new Date(result.checkedAt).toLocaleString('zh-CN')} 检测</span>
        </span>
      </label>
      {/* 单条操作：悬停、键盘聚焦或已勾选时出现 */}
      <div
        className={cn(
          'flex shrink-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
          checked ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Button size="icon" variant="ghost" disabled={busy} aria-label={`重新检测 ${name}`} title="重新检测" onClick={onRecheck}>
          <RefreshCw />
        </Button>
        <Button size="icon" variant="ghost" disabled={busy} aria-label={`忽略 ${name}`} title="忽略" onClick={onIgnore}>
          <EyeOff />
        </Button>
      </div>
      <Button asChild size="icon" variant="ghost" className="shrink-0">
        <a href={bookmark.url} target="_blank" rel="noreferrer" aria-label={`打开 ${name}`} title="打开">
          <ExternalLink />
        </a>
      </Button>
    </li>
  );
}
