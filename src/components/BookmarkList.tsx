import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Bookmark } from '../lib/bookmarks';

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

  if (bookmarks.length === 0) return <div className="list empty">没有匹配的书签</div>;

  return (
    <div ref={parentRef} className="list">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const b = bookmarks[item.index];
          if (!b) return null;
          return (
            <button
              key={b.id}
              className={`row ${b.id === selectedId ? 'active' : ''}`}
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              onClick={() => onSelect(b.id)}
            >
              <span className="row-title">{b.title || b.url}</span>
              <span className="row-meta">
                {b.domain || b.url.split(':')[0]} · {b.folderPath}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
