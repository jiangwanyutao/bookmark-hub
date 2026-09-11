import { useMemo, useState } from 'react';
import { useBookmarkTree } from '../../src/hooks/useBookmarkTree';
import { buildIndex } from '../../src/lib/bookmarks';
import { Overview } from '../../src/components/Overview';
import { BookmarksView } from '../../src/components/BookmarksView';

type View = 'overview' | 'bookmarks';

export function App() {
  const { tree, error } = useBookmarkTree();
  const index = useMemo(() => (tree ? buildIndex(tree) : null), [tree]);
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);

  if (error) return <p className="state">读取书签失败：{error}</p>;
  if (!tree || !index) return <p className="state">正在读取书签…</p>;

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">Bookmark Hub</strong>
        <input
          id="search"
          type="search"
          aria-label="搜索书签"
          placeholder="搜索标题、网址、目录…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setView('bookmarks');
          }}
        />
      </header>

      <nav className="sidebar" aria-label="主导航">
        <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>
          总览
        </button>
        <button className={view === 'bookmarks' ? 'active' : ''} onClick={() => setView('bookmarks')}>
          全部书签
        </button>
      </nav>

      <main className="content">
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
