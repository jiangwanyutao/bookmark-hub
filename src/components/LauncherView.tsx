import { useMemo, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { browser } from 'wxt/browser';
import { useTags } from '@/hooks/useTags';
import { searchBookmarks, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { categorize, sectionsForTab, subfolderTabs, toNavigableUrl, type TileItem } from '@/lib/launcher';
import { cn } from '@/lib/utils';
import { faviconUrl } from './Favicon';

const SELECTED_KEY = 'launcher:category';

// localStorage 在隐私模式等场景可能不可用，读写都不能让页面出错
function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

function writeSelected(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // 记不住上次的分类也不影响使用
  }
}

const siteName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// 在 Dashboard 里使用，一律在新标签页打开，不把 Dashboard 本身跳走
function Tile({ item }: { item: TileItem }) {
  const [broken, setBroken] = useState(false);
  const name = item.title || siteName(item.url);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      title={`${name}\n${item.url}`}
      className="flex min-w-0 flex-col items-center gap-2 rounded-lg p-3 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-16 items-center justify-center overflow-hidden rounded-lg bg-card ring-1 ring-border">
        {broken ? (
          <span className="text-2xl font-semibold text-primary">{name.slice(0, 1).toUpperCase()}</span>
        ) : (
          <img src={faviconUrl(item.url)} alt="" width={40} height={40} onError={() => setBroken(true)} />
        )}
      </span>
      <span className="w-full truncate text-center text-sm">{name}</span>
    </a>
  );
}

function TileGrid({ items }: { items: TileItem[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
      {items.map((item) => (
        <Tile key={item.id} item={item} />
      ))}
    </div>
  );
}

interface Props {
  roots: TreeNode[];
  index: BookmarkIndex;
}

export function LauncherView({ roots, index }: Props) {
  const { tags } = useTags();
  const categories = useMemo(() => categorize(roots), [roots]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [tab, setTab] = useState<string | null>(null);

  const selected = categories.find((c) => c.id === selectedId) ?? categories[0];
  const tabs = selected ? subfolderTabs(selected.sections) : [];
  const activeTab = tab !== null && tabs.includes(tab) ? tab : null;
  const results = query.trim() ? searchBookmarks(index.bookmarks, query, tags) : null;

  function select(id: string) {
    setSelectedId(id);
    writeSelected(id);
    setTab(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setQuery('');
    if (e.key !== 'Enter' || !query.trim()) return;
    const url = toNavigableUrl(query);
    if (url) void browser.tabs.create({ url });
    else void browser.search.query({ text: query.trim(), disposition: 'NEW_TAB' });
  }

  // 整页固定高度：搜索框固定在上方，分类栏和图标区各自滚动，二级目录标签固定在图标区顶部
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-8 pt-8 pb-6">
        <div className="relative mx-auto max-w-3xl">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="launcher-search"
            type="search"
            aria-label="搜索书签，回车搜网页"
            placeholder="搜索书签，回车搜网页"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-12 w-full rounded-xl border bg-card pr-6 pl-12 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {results ? (
        <section className="min-h-0 flex-1 space-y-3 overflow-auto px-8 pb-16">
          <p className="text-sm text-muted-foreground">
            {results.length > 0
              ? `找到 ${results.length} 个书签，按回车在网上搜索`
              : `没有匹配的书签，按回车在网上搜索「${query.trim()}」`}
          </p>
          <TileGrid items={results} />
        </section>
      ) : categories.length === 0 ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">还没有书签。</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)] gap-10 px-8">
          <nav aria-label="书签分类" className="flex min-h-0 flex-col gap-1 overflow-auto pb-8">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id)}
                className={cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-md px-4 py-2.5 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  c.id === selected?.id && 'bg-accent font-medium text-accent-foreground',
                )}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{c.count}</span>
              </button>
            ))}
          </nav>

          <section aria-label={selected?.name} className="flex min-h-0 min-w-0 flex-col">
            {tabs.length > 0 && (
              <div role="tablist" aria-label="二级目录" className="flex shrink-0 flex-wrap gap-2 pb-4">
                {['全部', ...tabs].map((label, i) => {
                  const value = i === 0 ? null : label;
                  const isActive = activeTab === value;
                  return (
                    <button
                      key={value ?? '__all'}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setTab(value)}
                      className={cn(
                        'rounded-md px-3.5 py-2 text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring',
                        isActive && 'bg-accent font-medium text-accent-foreground',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {/* 换分类或标签时重新挂载，滚动位置回到顶部 */}
            <div key={`${selected?.id}:${activeTab}`} className="min-h-0 flex-1 space-y-6 overflow-auto px-1 pb-16">
              {selected &&
                sectionsForTab(selected.sections, activeTab).map((s) => (
                  <div key={s.title ?? '_direct'} className={cn('space-y-2', s.title && 'border-t pt-5')}>
                    {s.title && (
                      <h2 className="flex items-baseline gap-2 px-3 text-sm font-semibold">
                        {s.title}
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">{s.items.length}</span>
                      </h2>
                    )}
                    <TileGrid items={s.items} />
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
