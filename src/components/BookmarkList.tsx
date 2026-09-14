import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchX } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';
import { Favicon } from './Favicon';

const ROW_HEIGHT = 56;
const OVERSCAN = 10;

interface Props {
  bookmarks: Bookmark[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function BookmarkList({ bookmarks, selectedId, onSelect }: Props) {
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
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const b = bookmarks[item.index];
          if (!b) return null;
          const selected = b.id === selectedId;
          return (
            <button
              key={b.id}
              aria-current={selected || undefined}
              className={cn(
                'absolute inset-x-0 top-0 flex items-center gap-3 border-b px-5 text-left outline-none',
                'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                selected && 'bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--primary)] hover:bg-accent',
              )}
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              onClick={() => onSelect(b.id)}
            >
              <Favicon url={b.url} name={b.title || b.domain || b.url} className="size-5 rounded" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{b.title || b.url}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {b.domain || b.url.split(':')[0]} · {b.folderPath}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
