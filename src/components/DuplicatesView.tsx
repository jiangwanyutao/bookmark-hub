import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BookmarkIndex } from '@/lib/bookmarks';
import { findDuplicateGroups, redundantCount, type DuplicateGroup, type DuplicateTier } from '@/lib/duplicates';
import type { Intent } from '@/lib/history';
import { runBatch } from '@/lib/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const TIER_LABEL: Record<DuplicateTier, string> = {
  exact: '完全重复',
  normalized: '规范化后重复',
  suspect: '疑似重复',
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
    return <p className="p-8 text-sm text-muted-foreground">没有发现重复书签。</p>;
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">重复书签</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {groups.length} 组，共 {redundantCount(groups)} 条多余。跨目录和疑似重复的需要你逐组选择保留哪一条。
          </p>
        </div>
        <Button
          disabled={autoIntents.length === 0}
          onClick={() =>
            void runBatch('清理重复书签', autoIntents, `已删除 ${autoIntents.length} 条重复书签`)
          }
        >
          <Trash2 />
          一键清理 {autoGroups.length} 组
        </Button>
      </div>

      {groups.map((g) => {
        const keepId = keepOf(g);
        return (
          <Card key={g.key}>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <Badge variant={g.tier === 'suspect' ? 'outline' : 'secondary'}>{TIER_LABEL[g.tier]}</Badge>
              {g.crossFolder && <Badge variant="outline">跨目录</Badge>}
              <span className="text-sm text-muted-foreground">{g.bookmarks.length} 条</span>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={keepId ?? ''}
                onValueChange={(id) => setKeepOverrides((prev) => ({ ...prev, [g.key]: id }))}
                aria-label="选择保留哪一条"
              >
                {g.bookmarks.map((b) => (
                  <div key={b.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-accent/50">
                    <RadioGroupItem value={b.id} id={`keep-${b.id}`} className="mt-1" />
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
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                disabled={!keepId}
                onClick={() =>
                  keepId &&
                  void runBatch(
                    '清理重复书签',
                    removeOthers(g, keepId),
                    `已删除 ${g.bookmarks.length - 1} 条重复书签`,
                  )
                }
              >
                {keepId ? `保留选中，删除其余 ${g.bookmarks.length - 1} 条` : '先选择要保留的一条'}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </section>
  );
}
