import { useRef, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchX } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Favicon } from './Favicon';

const ROW_HEIGHT = 56;
const OVERSCAN = 10;
const PAGE_STEP = 10;

interface Props {
  bookmarks: Bookmark[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 有搜索词或选了目录时，空状态给一个清空按钮 */
  onClearFilters?: () => void;
}

const optionId = (id: string) => `bookmark-option-${id}`;

export function BookmarkList({ bookmarks, selectedId, onSelect, onClearFilters }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: bookmarks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="size-6" />
        </div>
        <p className="text-sm font-medium">没有匹配的书签</p>
        <p className="max-w-xs text-sm text-muted-foreground">换个关键词，或在左侧选择其他目录。</p>
        {onClearFilters && (
          <Button size="sm" variant="outline" onClick={onClearFilters}>
            清空筛选
          </Button>
        )}
      </div>
    );
  }

  // 列表整体是一个焦点：↑↓ / PageUp / PageDown / Home / End 移动选中，不用逐条 Tab
  const handleKeyDown = (e: KeyboardEvent) => {
    const at = bookmarks.findIndex((b) => b.id === selectedId);
    const last = bookmarks.length - 1;
    const targets: Record<string, number> = {
      ArrowDown: at < 0 ? 0 : at + 1,
      ArrowUp: at < 0 ? 0 : at - 1,
      PageDown: at + PAGE_STEP,
      PageUp: at - PAGE_STEP,
      Home: 0,
      End: last,
    };
    if (!(e.key in targets)) return;
    e.preventDefault();
    const next = Math.min(Math.max(targets[e.key]!, 0), last);
    onSelect(bookmarks[next]!.id);
    virtualizer.scrollToIndex(next, { align: 'auto' });
  };

  const hasSelection = bookmarks.some((b) => b.id === selectedId);

  return (
    <div
      ref={parentRef}
      role="listbox"
      tabIndex={0}
      aria-label="书签"
      aria-activedescendant={hasSelection && selectedId ? optionId(selectedId) : undefined}
      onKeyDown={handleKeyDown}
      className="flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const b = bookmarks[item.index];
          if (!b) return null;
          const selected = b.id === selectedId;
          return (
            <div
              key={b.id}
              id={optionId(b.id)}
              role="option"
              aria-selected={selected}
              className={cn(
                'group absolute inset-x-0 top-0 flex cursor-pointer items-center gap-3 border-b px-5 text-left',
                'hover:bg-accent/50',
                selected && 'bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--primary)] hover:bg-accent',
              )}
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              onClick={() => onSelect(b.id)}
            >
              <Favicon url={b.url} name={b.title || b.domain || b.url} className="size-5 rounded" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{b.title || b.url}</span>
                <span className={cn('truncate text-xs', selected ? 'text-accent-foreground' : 'text-muted-foreground group-hover:text-accent-foreground')}>
                  {b.domain || b.url.split(':')[0]} · {b.folderPath}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
