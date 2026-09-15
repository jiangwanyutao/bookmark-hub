import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TreeNode } from '@/lib/bookmarks';
import { childFolderCounts, type FolderTile } from '@/lib/treemap';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CHILD_LIMIT = 6;
// 条形颜色：最多的一项用主色，往后逐级洗进轨道色
const MIX_MAX = 100;
const MIX_MIN = 45;

interface Props {
  tiles: FolderTile[];
  roots: TreeNode[];
  countByFolder: Map<string, number>;
  onOpenFolder: (folderId: string) => void;
}

/** 书签分布画成横向条形：一行一个一级目录，二级目录直接写在行里。悬停或聚焦的一行同步到底部。 */
export function DistributionBars({ tiles, roots, countByFolder, onOpenFolder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (tiles.length === 0) return <p className="p-4 text-sm text-muted-foreground">还没有书签。</p>;

  const max = Math.max(...tiles.map((t) => t.value));
  const total = tiles.reduce((sum, t) => sum + t.value, 0);
  const percentOf = (value: number) => Math.round((value / total) * 100);
  const active = tiles.find((t) => t.id === activeId) ?? tiles[0]!;

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col divide-y overflow-auto" onMouseLeave={() => setActiveId(null)}>
        {tiles.map((t, rank) => {
          const isActive = t.id === active.id;
          const percent = percentOf(t.value);
          const mix = MIX_MAX - (rank / Math.max(tiles.length - 1, 1)) * (MIX_MAX - MIX_MIN);
          const children = t.folderId ? childFolderCounts(roots, t.folderId, countByFolder).slice(0, CHILD_LIMIT) : [];
          const detail = !t.folderId
            ? '收藏在各处，还没归类'
            : children.length > 0
              ? children.map((c) => `${c.name} ${c.count.toLocaleString('zh-CN')}`).join('　')
              : '没有子目录';
          const muted = isActive ? 'text-accent-foreground' : 'text-muted-foreground';
          return (
            <button
              key={t.id}
              type="button"
              aria-label={`${t.name}：${t.value} 个书签，占 ${percent}%${t.folderId ? '，点击打开目录' : ''}`}
              onMouseEnter={() => setActiveId(t.id)}
              onFocus={() => setActiveId(t.id)}
              onClick={() => t.folderId && onOpenFolder(t.folderId)}
              className={cn(
                'flex min-h-fit flex-1 flex-col justify-center gap-1.5 border-l-2 border-l-transparent px-5 py-2 text-left outline-none transition-colors',
                'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                isActive && 'border-l-primary bg-accent text-accent-foreground hover:bg-accent',
                !t.folderId && 'cursor-default',
              )}
            >
              <span className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className="font-semibold tabular-nums">{t.value.toLocaleString('zh-CN')}</span>
                <span className={cn('w-10 text-right text-xs tabular-nums', muted)}>{percent}%</span>
              </span>
              {/* 条长是占最大一项的比例，占比文字才是占总数 */}
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(t.value / max) * 100}%`, backgroundColor: `color-mix(in srgb, var(--primary) ${mix}%, var(--muted))` }}
                />
              </span>
              <span className={cn('truncate text-xs', muted)}>{detail}</span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t px-5 py-3">
        <p className="min-w-0 truncate">
          <span className="text-sm font-semibold">{active.name}</span>
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
            {active.value.toLocaleString('zh-CN')} 个书签 · 占 {percentOf(active.value)}%
          </span>
        </p>
        {active.folderId && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => onOpenFolder(active.folderId!)}>
            打开目录
            <ChevronRight />
          </Button>
        )}
      </div>
    </div>
  );
}
