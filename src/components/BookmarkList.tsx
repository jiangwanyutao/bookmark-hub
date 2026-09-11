import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Bookmark } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';

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
    return <p className="p-6 text-sm text-muted-foreground">没有匹配的书签</p>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const b = bookmarks[item.index];
          if (!b) return null;
          return (
            <button
              key={b.id}
              className={cn(
                'absolute inset-x-0 top-0 flex flex-col justify-center border-b px-4 text-left outline-none',
                'hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                b.id === selectedId && 'bg-accent text-accent-foreground hover:bg-accent',
              )}
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              onClick={() => onSelect(b.id)}
            >
              <span className="truncate text-sm font-medium">{b.title || b.url}</span>
              <span className="truncate text-xs text-muted-foreground">
                {b.domain || b.url.split(':')[0]} · {b.folderPath}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
