import { ListTree } from 'lucide-react';
import { listFolders, type TreeNode } from '@/lib/bookmarks';
import { CATEGORY_SEPARATOR, summarizePlan, type OrganizePlan } from '@/lib/agent/plan';
import { Button } from '@/components/ui/button';

interface Props {
  plan: OrganizePlan;
  roots: TreeNode[];
  scopeBookmarkIds: string[];
  highlight: boolean;
  onPreview: () => void;
}

/** 分类按一级分组，保持提出时的顺序。 */
function groupByTopLevel(categories: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const category of categories) {
    const top = category.split(CATEGORY_SEPARATOR)[0]!;
    groups.set(top, [...(groups.get(top) ?? []), category]);
  }
  return [...groups];
}

export function PlanPanel({ plan, roots, scopeBookmarkIds, highlight, onPreview }: Props) {
  const folderPath = new Map(listFolders(roots).map((f) => [f.id, f.path]));
  const { counts, unassigned } = summarizePlan(plan, scopeBookmarkIds);
  const hasAssignments = Object.keys(plan.assignments).length > 0;
  const total = scopeBookmarkIds.length;
  const assigned = total - unassigned;
  const groups = groupByTopLevel(plan.categories);

  // 不再套卡片：作为对话旁边的一栏，只用左侧分隔线
  return (
    <aside className="flex flex-col gap-5 lg:max-h-[calc(100vh-8rem)] lg:border-l lg:pl-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">整理方案</h2>
        {plan.categories.length > 0 && <span className="text-xs text-muted-foreground">{plan.categories.length} 个分类</span>}
      </div>

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">整理范围</dt>
          <dd className="mt-0.5 break-words">
            {plan.scope ? plan.scope.folderIds.map((id) => folderPath.get(id) ?? id).join('、') : '尚未确认'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">新体系建在</dt>
          <dd className="mt-0.5">{plan.scope ? (folderPath.get(plan.scope.rootFolderId) ?? plan.scope.rootFolderId) : '尚未确认'}</dd>
        </div>
      </dl>

      {plan.scope && total > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">已分配</span>
            <span className="tabular-nums">
              {assigned} / {total}
            </span>
          </div>
          <div
            role="meter"
            aria-label="已分配书签"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={assigned}
            className="h-1.5 overflow-hidden rounded-full bg-primary/15"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${(assigned / total) * 100}%` }} />
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ListTree className="size-4 shrink-0" />
          智能体提出分类体系后会显示在这里。
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-auto border-t pt-4 text-sm">
          {groups.map(([top, categories]) => {
            const children = categories.filter((c) => c !== top);
            return (
              <li key={top}>
                <p className="flex justify-between gap-2 font-medium">
                  <span className="truncate">{top}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {categories.reduce((sum, c) => sum + (counts[c] ?? 0), 0)}
                  </span>
                </p>
                {children.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-l pl-3">
                    {children.map((c) => (
                      <li key={c} className="flex justify-between gap-2 text-muted-foreground">
                        <span className="truncate">{c.slice(top.length + CATEGORY_SEPARATOR.length)}</span>
                        <span className="tabular-nums">{counts[c] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          <li className="flex justify-between border-t pt-2 text-muted-foreground">
            <span>未归类</span>
            <span className="tabular-nums">{unassigned}</span>
          </li>
        </ul>
      )}

      <Button className="w-full" variant={highlight ? 'default' : 'outline'} disabled={!hasAssignments} onClick={onPreview}>
        预览并确认整理
      </Button>
    </aside>
  );
}
