import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BookmarkIndex } from '@/lib/bookmarks';
import { findDuplicateGroups, redundantCount, type DuplicateGroup, type DuplicateTier } from '@/lib/duplicates';
import type { Intent } from '@/lib/history';
import { runBatch } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Lighthouse } from './brand/Lighthouse';
import { Favicon } from './Favicon';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';
import { Pill, type PillTone } from './Pill';

const TIER_LABEL: Record<DuplicateTier, string> = {
  exact: '完全重复',
  normalized: '规范化后重复',
  suspect: '疑似重复',
};

// 疑似重复需要人判断，用警示色；其余是确定的重复
const TIER_TONE: Record<DuplicateTier, PillTone> = {
  exact: 'ok',
  normalized: 'ok',
  suspect: 'warn',
};

// 与 lib/duplicates.ts 的判重规则对应
const TIER_REASON: Record<DuplicateTier, string> = {
  exact: '网址完全相同',
  normalized: '只差 http/https、结尾斜杠或跟踪参数',
  suspect: '去掉 www. 或页内锚点后相同，可能是同一个页面',
};

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
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Lighthouse className="h-24 w-auto" />
        <div className="space-y-1">
          <p className="font-medium">没有发现重复书签</p>
          <p className="max-w-xs text-sm text-muted-foreground">每个网址都只收藏了一次，很干净。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4 px-6 py-5">
      <PageHeader
        title={`重复书签 ${groups.length} 组`}
        subtitle={`共 ${redundantCount(groups)} 条多余。跨目录和疑似重复的需要你逐组选择保留哪一条。`}
        actions={
          // 没有能自动判断保留项的组时不显示，免得出现「一键清理 0 组」
          autoIntents.length > 0 && (
            <Button onClick={() => void runBatch('清理重复书签', autoIntents, `已删除 ${autoIntents.length} 条重复书签`)}>
              <Trash2 />
              一键清理 {autoGroups.length} 组
            </Button>
          )
        }
      />

      <Panel className="flex-1" bodyClassName="overflow-auto">
        <ul className="divide-y">
          {groups.map((g) => {
            const keepId = keepOf(g);
            return (
              <li key={g.key} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={TIER_TONE[g.tier]}>{TIER_LABEL[g.tier]}</Pill>
                  {g.crossFolder && <Pill>跨目录</Pill>}
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {g.bookmarks.length} 条 · {TIER_REASON[g.tier]}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={!keepId}
                    onClick={() => keepId && void runBatch('清理重复书签', removeOthers(g, keepId), `已删除 ${g.bookmarks.length - 1} 条重复书签`)}
                  >
                    {keepId ? `保留选中，删除其余 ${g.bookmarks.length - 1} 条` : '先选择要保留的一条'}
                  </Button>
                </div>
                {g.defaultKeepId !== null && <p className="mt-1 text-xs text-muted-foreground">默认保留添加最早的一条，你可以改选。</p>}
                <RadioGroup
                  className="mt-2 gap-0.5"
                  value={keepId ?? ''}
                  onValueChange={(id) => setKeepOverrides((prev) => ({ ...prev, [g.key]: id }))}
                  aria-label="选择保留哪一条"
                >
                  {/* 整行是 label，内边距和空白处也能选中 */}
                  {g.bookmarks.map((b) => (
                    <label key={b.id} htmlFor={`keep-${b.id}`} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
                      {/* 选中态是加粗的主色圆环，比 8px 小圆点醒目 */}
                      <RadioGroupItem
                        value={b.id}
                        id={`keep-${b.id}`}
                        className="mt-0.5 size-4.5 data-[state=checked]:border-[5px] data-[state=checked]:border-primary [&_[data-slot=radio-group-indicator]]:hidden"
                      />
                      <Favicon url={b.url} name={b.title || b.url} className="mt-0.5 size-5 rounded" />
                      <span className="block min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{b.title || b.url}</span>
                          {b.id === g.defaultKeepId && (
                            <Pill tone="ok" className="shrink-0">
                              推荐保留
                            </Pill>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground" title={b.url}>
                          {b.url} · {b.folderPath}
                          {b.dateAdded ? ` · ${new Date(b.dateAdded).toLocaleDateString('zh-CN')} 添加` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
