import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BookmarkIndex } from '@/lib/bookmarks';
import { findDuplicateGroups, redundantCount, type DuplicateGroup, type DuplicateTier } from '@/lib/duplicates';
import type { Intent } from '@/lib/history';
import { runBatch } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Lighthouse } from './brand/Lighthouse';
import { Favicon } from './Favicon';

const TIER_LABEL: Record<DuplicateTier, string> = {
  exact: '完全重复',
  normalized: '规范化后重复',
  suspect: '疑似重复',
};

// 疑似重复需要人判断，用琥珀色提醒；其余是确定的重复
const TIER_CHIP: Record<DuplicateTier, string> = {
  exact: 'bg-accent text-accent-foreground',
  normalized: 'bg-accent text-accent-foreground',
  suspect: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};

const CHIP = 'rounded-md px-1.5 py-0.5 text-xs font-medium';

const removeOthers = (group: DuplicateGroup, keepId: string): Intent[] =>
  group.bookmarks.filter((b) => b.id !== keepId).map((b) => ({ type: 'remove', id: b.id }));

export function DuplicatesView({ index }: { index: BookmarkIndex }) {
  const groups = useMemo(() => findDuplicateGroups(index.bookmarks), [index]);
  const [keepOverrides, setKeepOverrides] = useState<Record<string, string>>({});

  const keepOf = (g: DuplicateGroup) => {
    const chosen = keepOverrides[g.key] ?? g.defaultKeepId;
    // 选中的那条可能已被删除
    return g.bookmarks.some((b) => b.id === chosen) ? chosen : null;
  };
  const autoGroups = groups.filter((g) => g.defaultKeepId !== null);
  const autoIntents = autoGroups.flatMap((g) => removeOthers(g, g.defaultKeepId!));

  if (groups.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Lighthouse className="h-28 w-auto" />
        <div className="space-y-1">
          <p className="font-medium">没有发现重复书签</p>
          <p className="max-w-xs text-sm text-muted-foreground">每个网址都只收藏了一次，很干净。</p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-4xl p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            重复书签
            <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">{groups.length} 组</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {redundantCount(groups)} 条多余。跨目录和疑似重复的需要你逐组选择保留哪一条。
          </p>
        </div>
        {/* 没有能自动判断保留项的组时不显示，免得出现「一键清理 0 组」 */}
        {autoIntents.length > 0 && (
          <Button onClick={() => void runBatch('清理重复书签', autoIntents, `已删除 ${autoIntents.length} 条重复书签`)}>
            <Trash2 />
            一键清理 {autoGroups.length} 组
          </Button>
        )}
      </div>

      <ul className="mt-6 divide-y rounded-xl border bg-card">
        {groups.map((g) => {
          const keepId = keepOf(g);
          return (
            <li key={g.key} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(CHIP, TIER_CHIP[g.tier])}>{TIER_LABEL[g.tier]}</span>
                {g.crossFolder && <span className={cn(CHIP, 'bg-muted text-muted-foreground')}>跨目录</span>}
                <span className="text-sm text-muted-foreground tabular-nums">{g.bookmarks.length} 条</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={!keepId}
                  onClick={() =>
                    keepId &&
                    void runBatch('清理重复书签', removeOthers(g, keepId), `已删除 ${g.bookmarks.length - 1} 条重复书签`)
                  }
                >
                  {keepId ? `保留选中，删除其余 ${g.bookmarks.length - 1} 条` : '先选择要保留的一条'}
                </Button>
              </div>
              <RadioGroup
                className="mt-3 gap-1"
                value={keepId ?? ''}
                onValueChange={(id) => setKeepOverrides((prev) => ({ ...prev, [g.key]: id }))}
                aria-label="选择保留哪一条"
              >
                {g.bookmarks.map((b) => (
                  <div key={b.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                    <RadioGroupItem value={b.id} id={`keep-${b.id}`} className="mt-1" />
                    <Favicon url={b.url} name={b.title || b.url} className="mt-0.5 size-5 rounded" />
                    <Label htmlFor={`keep-${b.id}`} className="block min-w-0 flex-1 cursor-pointer font-normal">
                      <span className="block truncate font-medium">{b.title || b.url}</span>
                      <span className="block text-xs break-all text-muted-foreground">{b.url}</span>
                      <span className="block text-xs text-muted-foreground">
                        {b.folderPath}
                        {b.dateAdded ? ` · ${new Date(b.dateAdded).toLocaleDateString('zh-CN')} 添加` : ''}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
