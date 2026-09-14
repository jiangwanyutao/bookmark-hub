import { useMemo, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { browser } from 'wxt/browser';
import { useTags } from '@/hooks/useTags';
import { searchBookmarks, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { categorize, sectionsForTab, subfolderTabs, toNavigableUrl, type TileItem } from '@/lib/launcher';
import { cn } from '@/lib/utils';

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

// 浏览器本地缓存的网站图标（favicon 权限），不发网络请求
const faviconUrl = (pageUrl: string) =>
  `${location.origin}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`;

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
      <span className="flex size-16 items-center justify-center overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border">
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

  return (
    <div className="px-8 pt-10 pb-16">
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
          className="h-13 w-full rounded-xl border bg-card pr-6 pl-12 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {results ? (
        <section className="mt-10 space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length > 0
              ? `找到 ${results.length} 个书签，按回车在网上搜索`
              : `没有匹配的书签，按回车在网上搜索「${query.trim()}」`}
          </p>
          <TileGrid items={results} />
        </section>
      ) : categories.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">还没有书签。</p>
      ) : (
        <div className="mt-10 grid grid-cols-[200px_1fr] gap-10">
          <nav aria-label="书签分类" className="sticky top-4 flex flex-col gap-1 self-start">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-4 py-2.5 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring',
                  c.id === selected?.id && 'bg-accent font-medium text-accent-foreground',
                )}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{c.count}</span>
              </button>
            ))}
          </nav>

          <section aria-label={selected?.name} className="min-w-0 space-y-6">
            {tabs.length > 0 && (
              <div role="tablist" aria-label="二级目录" className="flex flex-wrap gap-2">
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
            {selected && sectionsForTab(selected.sections, activeTab).map((s) => (
              <div key={s.title ?? '_direct'} className="space-y-2">
                {s.title && <h2 className="px-3 text-sm font-medium text-muted-foreground">{s.title}</h2>}
                <TileGrid items={s.items} />
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
