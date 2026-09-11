import { listFolders, type TreeNode } from '@/lib/bookmarks';
import { summarizePlan, type OrganizePlan } from '@/lib/agent/plan';
import { Button } from '@/components/ui/button';

interface Props {
  plan: OrganizePlan;
  roots: TreeNode[];
  scopeBookmarkIds: string[];
  highlight: boolean;
  onPreview: () => void;
}

export function PlanPanel({ plan, roots, scopeBookmarkIds, highlight, onPreview }: Props) {
  const folderPath = new Map(listFolders(roots).map((f) => [f.id, f.path]));
  const { counts, unassigned } = summarizePlan(plan, scopeBookmarkIds);
  const hasAssignments = Object.keys(plan.assignments).length > 0;

  return (
    <aside className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">整理方案</h2>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">整理范围</dt>
          <dd>{plan.scope ? plan.scope.folderIds.map((id) => folderPath.get(id) ?? id).join('、') : '尚未确认'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">新体系建在</dt>
          <dd>{plan.scope ? (folderPath.get(plan.scope.rootFolderId) ?? plan.scope.rootFolderId) : '尚未确认'}</dd>
        </div>
      </dl>
      {plan.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">智能体提出分类体系后会显示在这里。</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {plan.categories.map((category) => (
            <li key={category} className="flex justify-between gap-2">
              <span className="truncate">{category}</span>
              <span className="text-muted-foreground tabular-nums">{counts[category] ?? 0}</span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 text-muted-foreground">
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
