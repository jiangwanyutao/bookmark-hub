import { useMemo, useState } from 'react';
import { Bot } from 'lucide-react';
import { listFolders, type TreeNode } from '@/lib/bookmarks';
import type { PlanScope } from '@/lib/agent/plan';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FolderRow {
  id: string;
  title: string;
  depth: number;
  ancestorIds: string[];
}

const INDENT_PX = 16;

function folderRows(roots: TreeNode[]): FolderRow[] {
  const rows: FolderRow[] = [];
  const walk = (node: TreeNode, parent: FolderRow | null) => {
    for (const child of node.children ?? []) {
      if (child.url !== undefined) continue;
      const row = {
        id: child.id,
        title: child.title,
        depth: parent ? parent.depth + 1 : 0,
        ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [],
      };
      rows.push(row);
      walk(child, row);
    }
  };
  roots.forEach((root) => walk(root, null));
  return rows;
}

interface Props {
  roots: TreeNode[];
  countByFolder: Map<string, number>;
  onStart: (scope: PlanScope) => void;
}

export function ScopePicker({ roots, countByFolder, onStart }: Props) {
  const rows = useMemo(() => folderRows(roots), [roots]);
  const folders = useMemo(() => listFolders(roots), [roots]);
  const [checked, setChecked] = useState<string[]>([]);
  const [pickedRoot, setPickedRoot] = useState<string>();
  const rootFolderId = pickedRoot ?? folders[0]?.id;

  // 范围含子目录：勾了父目录就不再单独记子目录
  function toggle(row: FolderRow, on: boolean) {
    setChecked((prev) =>
      on ? [...prev.filter((id) => !rows.find((r) => r.id === id)?.ancestorIds.includes(row.id)), row.id] : prev.filter((id) => id !== row.id),
    );
  }

  return (
    <div className="flex min-h-[480px] flex-col gap-4 rounded-xl border p-6">
      <div className="flex items-start gap-3">
        <Bot className="mt-0.5 size-6 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          勾选要整理的目录（含子目录），再选新分类体系建在哪个目录下。智能体会提出分类体系，过程中你可以随时插话调整，确认后才会移动书签。
        </p>
      </div>
      <div role="group" aria-label="整理范围" className="max-h-[50vh] min-h-0 flex-1 space-y-0.5 overflow-auto rounded-lg border p-2">
        {rows.map((row) => {
          const covered = row.ancestorIds.some((id) => checked.includes(id));
          return (
            <label
              key={row.id}
              className="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-accent has-disabled:cursor-default"
              style={{ paddingLeft: 8 + row.depth * INDENT_PX }}
            >
              <Checkbox checked={covered || checked.includes(row.id)} disabled={covered} onCheckedChange={(value) => toggle(row, value === true)} />
              <span className="truncate">{row.title || '（未命名）'}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{countByFolder.get(row.id) ?? 0}</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span id="scope-root-label" className="text-sm">
          新分类体系建在
        </span>
        <Select value={rootFolderId} onValueChange={setPickedRoot}>
          <SelectTrigger aria-labelledby="scope-root-label" className="w-64 max-w-full">
            <SelectValue placeholder="选择目录" />
          </SelectTrigger>
          <SelectContent>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" disabled={checked.length === 0 || !rootFolderId} onClick={() => rootFolderId && onStart({ folderIds: checked, rootFolderId })}>
          开始整理
        </Button>
      </div>
    </div>
  );
}
