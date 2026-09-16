import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CircleHelp,
  Copy,
  CornerUpRight,
  History,
  Compass,
  LayoutDashboard,
  Link2Off,
  List,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useBookmarkTree } from '@/hooks/useBookmarkTree';
import { useScanResults } from '@/hooks/useScanResults';
import { buildIndex } from '@/lib/bookmarks';
import { findDuplicateGroups, redundantCount } from '@/lib/duplicates';
import { bookmarksBarId } from '@/lib/health';
import { summarizeHealth } from '@/lib/scan/scanner';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Overview } from '@/components/Overview';
import { BookmarksView } from '@/components/BookmarksView';
import { HistoryView } from '@/components/HistoryView';
import { DuplicatesView } from '@/components/DuplicatesView';
import { ScanView } from '@/components/ScanView';
import { IssuesView } from '@/components/IssuesView';
import { SettingsView } from '@/components/SettingsView';
import { AgentOrganizeView } from '@/components/AgentOrganizeView';
import { LauncherView } from '@/components/LauncherView';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Lighthouse } from '@/components/brand/Lighthouse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';

type View =
  | 'overview'
  | 'launcher'
  | 'bookmarks'
  | 'organize'
  | 'scan'
  | 'broken'
  | 'duplicates'
  | 'redirected'
  | 'pending'
  | 'history'
  | 'settings';

const NAV_GROUPS = [
  { label: '概览', items: [{ view: 'overview', label: '总览', icon: LayoutDashboard }] },
  {
    label: '书签',
    items: [
      { view: 'launcher', label: '书签导航', icon: Compass },
      { view: 'bookmarks', label: '全部书签', icon: List },
      { view: 'organize', label: '智能整理', icon: Sparkles },
    ],
  },
  {
    label: '清理',
    items: [
      { view: 'scan', label: '健康扫描', icon: Activity },
      { view: 'broken', label: '失效链接', icon: Link2Off },
      { view: 'duplicates', label: '重复书签', icon: Copy },
      { view: 'redirected', label: '重定向', icon: CornerUpRight },
      { view: 'pending', label: '待确认', icon: CircleHelp },
    ],
  },
  {
    label: '系统',
    items: [
      { view: 'history', label: '操作记录', icon: History },
      { view: 'settings', label: '设置', icon: Settings },
    ],
  },
] as const;

const IS_MAC = /Mac/.test(navigator.platform);

export function App() {
  const { tree, error } = useBookmarkTree();
  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree]);
  const { results, ignored } = useScanResults();
  const theme = useTheme();
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘/Ctrl+K 随处聚焦搜索；不在输入框里时 / 也可以
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 侧栏上待处理的数量
  const badges = useMemo((): Partial<Record<View, number>> => {
    if (!index) return {};
    const health = summarizeHealth(index.bookmarks, results, ignored);
    return {
      broken: health.broken,
      duplicates: redundantCount(findDuplicateGroups(index.bookmarks)),
      redirected: health.redirected,
      pending: health.pending,
    };
  }, [index, results, ignored]);

  if (error) return <p className="p-10 text-sm text-destructive">读取书签失败：{error}</p>;
  if (!tree || !index) return <p className="p-10 text-sm text-muted-foreground">正在读取书签…</p>;

  return (
    // 视口低于 xl（1280px）时侧栏收成图标栏
    <div className="grid h-screen grid-cols-[56px_minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] bg-background xl:grid-cols-[232px_minmax(0,1fr)]">
      <header className="col-span-2 flex items-center gap-4 border-b bg-sidebar px-3.5 xl:px-4">
        <span className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight xl:w-[200px]">
          {/* 矢量 logo：PNG 缩到 28px 会发虚；薄荷方块 + 灯塔，暗色下跟随品牌色令牌 */}
          <span aria-hidden className="flex size-7 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-[var(--brand-mint)]">
            <Lighthouse className="h-6 w-auto translate-y-0.5" />
          </span>
          <span className="sr-only xl:not-sr-only">书签体检</span>
        </span>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          {/* 在「全部书签」里边打边筛；在其他页面回车才跳过去，免得打字就丢掉当前页面的进度 */}
          <Input
            ref={searchRef}
            id="search"
            type="search"
            aria-label="搜索书签"
            aria-keyshortcuts={IS_MAC ? 'Meta+K /' : 'Control+K /'}
            placeholder={view === 'bookmarks' ? '搜索标题、网址、目录…' : '搜索标题、网址、目录，回车查看…'}
            className="h-9 rounded-md bg-card pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setView('bookmarks');
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
            }}
          />
          {!query && (
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          )}
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <nav aria-label="主导航" className="flex flex-col gap-3 overflow-auto border-r bg-sidebar px-2 py-4 xl:gap-5 xl:px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="sr-only px-3 pb-1.5 text-xs font-medium text-muted-foreground xl:not-sr-only">{group.label}</p>
            {group.items.map(({ view: target, label, icon: Icon }) => {
              const active = view === target;
              const count = badges[target] ?? 0;
              return (
                <Button
                  key={target}
                  variant="ghost"
                  title={label}
                  className={cn(
                    'relative h-9 justify-center gap-2.5 px-0 xl:justify-start xl:px-3',
                    active
                      ? 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground'
                      : 'font-normal text-muted-foreground hover:bg-card hover:text-foreground',
                  )}
                  onClick={() => setView(target)}
                >
                  <Icon />
                  <span className="sr-only xl:not-sr-only">{label}</span>
                  {count > 0 && (
                    <>
                      <span className={cn('ml-auto hidden text-xs tabular-nums xl:inline', active ? 'text-accent-foreground' : 'text-muted-foreground')}>
                        {count.toLocaleString('zh-CN')}
                      </span>
                      {/* 图标栏里放不下数字，用小圆点提示有待处理 */}
                      <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary xl:hidden" />
                    </>
                  )}
                </Button>
              );
            })}
          </div>
        ))}
      </nav>

      <main className="min-h-0 overflow-auto">
        {view === 'overview' && (
          <Overview
            index={index}
            roots={tree}
            barId={bookmarksBarId(tree)}
            onNavigate={setView}
            onOpenFolder={(id) => {
              setFolderId(id);
              setView('bookmarks');
            }}
          />
        )}
        {view === 'launcher' && <LauncherView roots={tree} index={index} />}
        {view === 'bookmarks' && (
          <BookmarksView
            roots={tree}
            index={index}
            query={query}
            folderId={folderId}
            onSelectFolder={setFolderId}
            onClearQuery={() => setQuery('')}
          />
        )}
        {view === 'organize' && <AgentOrganizeView index={index} roots={tree} onOpenSettings={() => setView('settings')} />}
        {view === 'scan' && <ScanView bookmarks={index.bookmarks} />}
        {(view === 'broken' || view === 'redirected' || view === 'pending') && (
          <IssuesView key={view} kind={view} bookmarks={index.bookmarks} />
        )}
        {view === 'duplicates' && <DuplicatesView index={index} />}
        {view === 'history' && <HistoryView />}
        {view === 'settings' && <SettingsView />}
      </main>

      <Toaster position="bottom-right" theme={theme} />
    </div>
  );
}
