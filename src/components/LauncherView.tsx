import { useMemo, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { browser } from 'wxt/browser';
import { useTags } from '@/hooks/useTags';
import { searchBookmarks, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { categorize, sectionsForTab, subfolderTabs, toNavigableUrl, type TileItem } from '@/lib/launcher';
import { cn } from '@/lib/utils';
import { Favicon } from './Favicon';
import { PageHeader, pageLayout } from './PageHeader';
import { Panel } from './Panel';

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

// 同一网站稳定得到同一个底色，没有图标的磁贴之间也能分辨
const tintOf = (url: string) => {
  let hash = 0;
  for (const ch of siteName(url)) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return `color-mix(in srgb, var(--primary) ${18 + (hash % 27)}%, var(--muted))`;
};

// 在 Dashboard 里使用，一律在新标签页打开，不把 Dashboard 本身跳走
function Tile({ item }: { item: TileItem }) {
  const name = item.title || siteName(item.url);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      title={`${name}\n${item.url}`}
      className="group flex min-w-0 flex-col items-center gap-2 rounded-lg p-3 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Favicon
        url={item.url}
        name={name}
        style={{ background: tintOf(item.url) }}
        className="size-16 rounded-xl text-2xl text-foreground transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5"
      />
      <span className="w-full truncate text-center text-sm">{name}</span>
    </a>
  );
}

// 磁贴设上限并靠左，少量磁贴不会被拉成大块
function TileGrid({ items }: { items: TileItem[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7.25rem,8.25rem))] justify-start gap-2">
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
  const maxCount = Math.max(1, ...categories.map((c) => c.count));
  const itemCount = (tabLabel: string | null) =>
    selected ? sectionsForTab(selected.sections, tabLabel).reduce((sum, s) => sum + s.items.length, 0) : 0;
  const sharePercent = selected && index.bookmarks.length > 0 ? Math.round((selected.count / index.bookmarks.length) * 100) : 0;

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

  const search = (
    <div className="relative w-80 max-w-full">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id="launcher-search"
        type="search"
        aria-label="搜索书签，回车搜网页"
        placeholder="搜索书签，回车搜网页"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-9 w-full rounded-lg border bg-card pr-14 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border bg-muted px-1.5 text-xs text-muted-foreground">
        回车
      </kbd>
    </div>
  );

  // 一屏完成：分类栏和图标区是两个面板，各自滚动
  return (
    <div className={pageLayout()}>
      <PageHeader title="书签导航" subtitle="按目录浏览常用网站，在新标签页打开。" actions={search} />

      {results ? (
        <Panel
          title="搜索结果"
          meta={results.length > 0 ? `找到 ${results.length} 个，按回车在网上搜索` : `没有匹配的书签，按回车在网上搜索「${query.trim()}」`}
          className="flex-1"
          bodyClassName="overflow-auto p-3"
        >
          <TileGrid items={results} />
        </Panel>
      ) : categories.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">还没有书签。</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] gap-4">
          <Panel title="分类" className="h-full" bodyClassName="overflow-auto p-2">
            <nav aria-label="书签分类" className="flex flex-col gap-0.5">
              {categories.map((c) => {
                const isActive = c.id === selected?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(c.id)}
                    className={cn(
                      'flex shrink-0 flex-col gap-1.5 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <span className={cn('text-xs tabular-nums', isActive ? 'text-accent-foreground' : 'text-muted-foreground')}>{c.count}</span>
                    </span>
                    {/* 条长是占最大分类的比例，方便横向比较 */}
                    <span aria-hidden className={cn('h-[3px] w-full overflow-hidden rounded-full', isActive ? 'bg-accent-foreground/15' : 'bg-muted')}>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                    </span>
                  </button>
                );
              })}
            </nav>
          </Panel>

          <section aria-label={selected?.name} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
            {tabs.length > 0 && (
              <div role="tablist" aria-label="二级目录" className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-2">
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
                        'rounded-md px-3 py-1.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
                        isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
                      )}
                    >
                      {label}
                      <span className={cn('ml-1.5 text-xs tabular-nums', isActive ? 'text-accent-foreground' : 'text-muted-foreground')}>
                        {itemCount(value)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {/* 换分类或标签时重新挂载，滚动位置回到顶部 */}
            <div key={`${selected?.id}:${activeTab}`} className="min-h-0 flex-1 space-y-5 overflow-auto p-3">
              {selected &&
                sectionsForTab(selected.sections, activeTab).map((s) => (
                  <div key={s.title ?? '_direct'} className={cn('space-y-2', s.title && 'border-t pt-4')}>
                    {s.title && (
                      <h2 className="flex items-baseline gap-2 px-2.5 text-sm font-semibold">
                        {s.title}
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">{s.items.length}</span>
                      </h2>
                    )}
                    <TileGrid items={s.items} />
                  </div>
                ))}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground tabular-nums">
              <span>占全部书签的 {sharePercent}%</span>
              <span>
                {itemCount(activeTab)} 个{activeTab ? ` · 已筛选「${activeTab}」` : ''}
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
