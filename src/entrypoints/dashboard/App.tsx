import { useMemo, useState } from 'react';
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

export function App() {
  const { tree, error } = useBookmarkTree();
  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree]);
  const { results, ignored } = useScanResults();
  const theme = useTheme();
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);

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
    <div className="grid h-screen grid-cols-[232px_minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] bg-background">
      <header className="col-span-2 flex items-center gap-4 border-b bg-sidebar px-4">
        <span className="flex w-[200px] shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <img src="/icon-48.png" alt="" className="size-7 rounded-md" />
          Bookmark Hub
        </span>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="search"
            type="search"
            aria-label="搜索书签"
            placeholder="搜索标题、网址、目录…"
            className="h-9 rounded-md bg-card pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setView('bookmarks');
            }}
          />
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <nav aria-label="主导航" className="flex flex-col gap-5 overflow-auto border-r bg-sidebar px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.items.map(({ view: target, label, icon: Icon }) => {
              const active = view === target;
              const count = badges[target] ?? 0;
              return (
                <Button
                  key={target}
                  variant="ghost"
                  className={
                    active
                      ? 'h-9 justify-start gap-2.5 bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground'
                      : 'h-9 justify-start gap-2.5 font-normal text-muted-foreground hover:bg-card hover:text-foreground'
                  }
                  onClick={() => setView(target)}
                >
                  <Icon />
                  {label}
                  {count > 0 && (
                    <span className={cn('ml-auto text-xs tabular-nums', active ? 'text-accent-foreground' : 'text-muted-foreground')}>
                      {count.toLocaleString('zh-CN')}
                    </span>
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
          <BookmarksView roots={tree} index={index} query={query} folderId={folderId} onSelectFolder={setFolderId} />
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
