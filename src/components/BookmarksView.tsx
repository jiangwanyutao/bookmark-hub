import { useState } from 'react';
import { listFolders, searchBookmarks, sortBookmarks, type BookmarkIndex, type SortKey, type TreeNode } from '@/lib/bookmarks';
import { useTags } from '@/hooks/useTags';
import { useScanResults } from '@/hooks/useScanResults';
import { FolderTree } from './FolderTree';
import { BookmarkList } from './BookmarkList';
import { BookmarkDetail } from './BookmarkDetail';
import { PageHeader, pageLayout } from './PageHeader';
import { HEALTH_META, type HealthState } from './HealthDot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'tree', label: '书签栏顺序' },
  { value: 'newest', label: '最近添加' },
  { value: 'oldest', label: '最早添加' },
  { value: 'title', label: '按标题' },
  { value: 'domain', label: '按域名' },
];
// suspicious 和 unknown 对用户都是「待确认」，合成一项
type HealthFilter = 'all' | Exclude<HealthState, 'unknown'>;
const HEALTH_FILTERS: HealthFilter[] = ['all', 'healthy', 'broken', 'redirected', 'suspicious', 'unscanned'];
const ALL = 'all';
const SORT_STORAGE_KEY = 'bookmarksSort';

function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_OPTIONS.some((o) => o.value === v) ? (v as SortKey) : 'tree';
  } catch {
    return 'tree';
  }
}

interface Props {
  roots: TreeNode[];
  index: BookmarkIndex;
  query: string;
  folderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onClearQuery: () => void;
}

export function BookmarksView({ roots, index, query, folderId, onSelectFolder, onClearQuery }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { tags, save: saveTags } = useTags();
  const { results } = useScanResults();
  const [sortKey, setSortKey] = useState<SortKey>(loadSort);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(ALL);
  const [tagFilter, setTagFilter] = useState<string>(ALL);

  const folders = listFolders(roots);
  const allTags = [...new Set([...tags.values()].flat())].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const healthOf = (url: string): HealthFilter => {
    const health = results.get(url)?.health ?? 'unscanned';
    return health === 'unknown' ? 'suspicious' : health;
  };
  const inFolder = folderId ? index.bookmarks.filter((b) => b.ancestorIds.includes(folderId)) : index.bookmarks;
  const filtered = inFolder.filter(
    (b) =>
      (healthFilter === ALL || healthOf(b.url) === healthFilter) &&
      (tagFilter === ALL || (tags.get(b.url) ?? []).includes(tagFilter)),
  );
  const visible = sortBookmarks(searchBookmarks(filtered, query, tags), sortKey);
  // 书签在浏览器里被删掉后，这里自然变成 undefined
  const selected = index.bookmarks.find((b) => b.id === selectedId);
  const folderName = folderId ? (folders.find((f) => f.id === folderId)?.path ?? '目录') : '全部书签';

  const clearFilters =
    query || folderId || healthFilter !== ALL || tagFilter !== ALL
      ? () => {
          onClearQuery();
          onSelectFolder(null);
          setHealthFilter(ALL);
          setTagFilter(ALL);
        }
      : undefined;

  // 三栏面板：目录 / 列表 / 详情，各自滚动；低于 lg 时详情挪到下面一整行
  return (
    <div className={pageLayout()}>
      <PageHeader
        title={folderName}
        subtitle={`${visible.length.toLocaleString('zh-CN')} 个书签${query ? ` · 搜索「${query}」` : ''}`}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)] grid-rows-[minmax(18rem,1fr)_auto] gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_18rem] lg:grid-rows-1 xl:grid-cols-[15rem_minmax(0,1fr)_20rem] [&>aside]:col-span-2 lg:[&>aside]:col-span-1">
        <FolderTree roots={roots} countByFolder={index.countByFolder} selectedId={folderId} onSelect={onSelectFolder} />
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
            <Select
              value={sortKey}
              onValueChange={(v: SortKey) => {
                setSortKey(v);
                try {
                  localStorage.setItem(SORT_STORAGE_KEY, v);
                } catch {}
              }}
            >
              <SelectTrigger size="sm" aria-label="排序" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={healthFilter} onValueChange={(v: HealthFilter) => setHealthFilter(v)}>
              <SelectTrigger size="sm" aria-label="健康状态" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEALTH_FILTERS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h === ALL ? '全部状态' : HEALTH_META[h].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allTags.length > 0 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger size="sm" aria-label="标签" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部标签</SelectItem>
                  {allTags.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <BookmarkList
            bookmarks={visible}
            tags={tags}
            results={results}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onClearFilters={clearFilters}
          />
          {visible.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 border-t px-4 py-1.5 text-xs text-muted-foreground">
              <span>↑↓ 移动</span>
              <span>PageUp / PageDown 翻页</span>
              <span>Home / End 首尾</span>
            </div>
          )}
        </section>
        <BookmarkDetail
          bookmark={selected}
          results={results}
          folders={folders}
          tags={selected ? (tags.get(selected.url) ?? []) : []}
          onSaveTags={async (next) => {
            if (selected) await saveTags([[selected.url, next]]);
          }}
        />
      </div>
    </div>
  );
}
