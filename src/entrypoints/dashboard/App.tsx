import { useMemo, useState } from 'react';
import { Bookmark, LayoutDashboard, List, Search } from 'lucide-react';
import { useBookmarkTree } from '@/hooks/useBookmarkTree';
import { buildIndex } from '@/lib/bookmarks';
import { Overview } from '@/components/Overview';
import { BookmarksView } from '@/components/BookmarksView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type View = 'overview' | 'bookmarks';

const NAV_ITEMS = [
  { view: 'overview', label: '总览', icon: LayoutDashboard },
  { view: 'bookmarks', label: '全部书签', icon: List },
] as const;

export function App() {
  const { tree, error } = useBookmarkTree();
  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree]);
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);

  if (error) return <p className="p-10 text-sm text-destructive">读取书签失败：{error}</p>;
  if (!tree || !index) return <p className="p-10 text-sm text-muted-foreground">正在读取书签…</p>;

  return (
    <div className="grid h-screen grid-cols-[200px_1fr] grid-rows-[56px_1fr]">
      <header className="col-span-2 flex items-center gap-8 border-b px-5">
        <span className="flex items-center gap-2 font-semibold text-primary">
          <Bookmark className="size-5" />
          Bookmark Hub
        </span>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="search"
            type="search"
            aria-label="搜索书签"
            placeholder="搜索标题、网址、目录…"
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setView('bookmarks');
            }}
          />
        </div>
      </header>

      <nav aria-label="主导航" className="flex flex-col gap-1 border-r bg-muted/40 p-3">
        {NAV_ITEMS.map(({ view: target, label, icon: Icon }) => (
          <Button
            key={target}
            variant={view === target ? 'secondary' : 'ghost'}
            className="justify-start"
            onClick={() => setView(target)}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </nav>

      <main className="min-h-0 overflow-auto">
        {view === 'overview' ? (
          <Overview index={index} />
        ) : (
          <BookmarksView
            roots={tree}
            index={index}
            query={query}
            folderId={folderId}
            onSelectFolder={setFolderId}
          />
        )}
      </main>
    </div>
  );
}
