import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TreeNode } from '@/lib/bookmarks';
import { childFolderCounts, type FolderTile } from '@/lib/treemap';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// 最矮的书也要能竖排两三个字
const MIN_HEIGHT_PCT = 24;
// 书脊颜色：主色洗进卡片色，越多越浓；文字一律用前景色（亮暗对比度都 ≥ 4.5）
const TINT_MIN = 10;
const TINT_MAX = 34;
const CHILD_LIMIT = 6;

const tint = (percent: number) => `color-mix(in srgb, var(--primary) ${percent}%, var(--card))`;

interface Props {
  tiles: FolderTile[];
  roots: TreeNode[];
  countByFolder: Map<string, number>;
  onOpenFolder: (folderId: string) => void;
}

/** 书签分布画成书架：一本书是一个一级目录，书高代表书签数。悬停或聚焦时底部显示详情。 */
export function Bookshelf({ tiles, roots, countByFolder, onOpenFolder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (tiles.length === 0) return <p className="p-4 text-sm text-muted-foreground">还没有书签。</p>;

  const max = Math.max(...tiles.map((t) => t.value));
  const total = tiles.reduce((sum, t) => sum + t.value, 0);
  const percentOf = (value: number) => Math.round((value / total) * 100);
  const active = tiles.find((t) => t.id === activeId) ?? tiles[0]!;
  const children = active.folderId ? childFolderCounts(roots, active.folderId, countByFolder).slice(0, CHILD_LIMIT) : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-end justify-center gap-1.5 px-5 pt-6" onMouseLeave={() => setActiveId(null)}>
        {tiles.map((t, rank) => {
          const mix = TINT_MAX - (rank / Math.max(tiles.length - 1, 1)) * (TINT_MAX - TINT_MIN);
          const label = `${t.name}：${t.value} 个书签，占 ${percentOf(t.value)}%${t.folderId ? '，点击打开目录' : ''}`;
          return (
            <button
              key={t.id}
              type="button"
              aria-label={label}
              title={label}
              onMouseEnter={() => setActiveId(t.id)}
              onFocus={() => setActiveId(t.id)}
              onClick={() => t.folderId && onOpenFolder(t.folderId)}
              className={cn(
                'relative flex max-w-24 min-w-9 flex-col items-center overflow-hidden rounded-t-md border border-b-0 px-1 pt-4 pb-3 text-foreground outline-none',
                'transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-1.5 motion-safe:focus-visible:-translate-y-1.5',
                t.id === active.id && 'border-primary/50',
                !t.folderId && 'cursor-default',
              )}
              style={{ height: `${MIN_HEIGHT_PCT + ((100 - MIN_HEIGHT_PCT) * t.value) / max}%`, flex: `${Math.sqrt(t.value)} 1 0`, backgroundColor: tint(mix) }}
            >
              {/* 书脊上下两道压线 */}
              <span aria-hidden className="absolute inset-x-1.5 top-2 h-px bg-foreground/15" />
              <span aria-hidden className="absolute inset-x-1.5 bottom-1.5 h-px bg-foreground/15" />
              {/* 最多的那本挂一条书签带 */}
              {rank === 0 && (
                <span
                  aria-hidden
                  className="absolute top-0 right-1.5 h-7 w-2 bg-[var(--brand-coral)] [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]"
                />
              )}
              <span className="min-h-0 overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap [text-orientation:upright] [writing-mode:vertical-rl]">
                {t.name}
              </span>
              {/* 书脊底部标数量，书矮时名字先省略、数量保留 */}
              <span className="mt-auto shrink-0 pt-1 text-xs tabular-nums">{t.value.toLocaleString('zh-CN')}</span>
            </button>
          );
        })}
      </div>
      {/* 书架板 */}
      <div aria-hidden className="mx-3 h-2.5 shrink-0 rounded-full border bg-muted shadow-card" />

      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{active.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {active.value.toLocaleString('zh-CN')} 个书签 · 占 {percentOf(active.value)}%
          </p>
        </div>
        {children.length > 0 && (
          <ul aria-label="二级目录" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {children.map((c) => (
              <li key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {c.name} <span className="text-muted-foreground tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
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
