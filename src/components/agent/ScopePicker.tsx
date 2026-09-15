import { useMemo, useState } from 'react';
import { Lighthouse } from '@/components/brand/Lighthouse';
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
  // countByFolder 含子目录，勾了父目录时子目录不会重复记录，直接累加即可
  const coveredCount = useMemo(() => checked.reduce((sum, id) => sum + (countByFolder.get(id) ?? 0), 0), [checked, countByFolder]);

  // 范围含子目录：勾了父目录就不再单独记子目录
  function toggle(row: FolderRow, on: boolean) {
    setChecked((prev) =>
      on ? [...prev.filter((id) => !rows.find((r) => r.id === id)?.ancestorIds.includes(row.id)), row.id] : prev.filter((id) => id !== row.id),
    );
  }

  // 一个面板：说明横幅 + 目录列表（面板内滚动）+ 底部操作
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex shrink-0 items-center gap-4 border-b bg-accent px-5 py-3 text-accent-foreground">
        <Lighthouse className="h-12 w-auto shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">先圈出这次要整理的目录</p>
          <p className="text-sm">勾选目录（含子目录），再选新分类建在哪里。智能体提出分类后你可以随时插话调整，确认后才会移动书签。</p>
        </div>
      </div>
      <div role="group" aria-label="整理范围" className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {rows.map((row) => {
          const covered = row.ancestorIds.some((id) => checked.includes(id));
          return (
            <label
              key={row.id}
              className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-muted/60 has-disabled:cursor-default"
              style={{ paddingLeft: 8 + row.depth * INDENT_PX }}
            >
              <Checkbox checked={covered || checked.includes(row.id)} disabled={covered} onCheckedChange={(value) => toggle(row, value === true)} />
              <span className="truncate">{row.title || '（未命名）'}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{countByFolder.get(row.id) ?? 0}</span>
            </label>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t px-4 py-3">
        {/* 内网地址不会发给 AI，所以是「约」 */}
        <span className="text-xs text-muted-foreground tabular-nums">
          已选 {checked.length} 个目录 · 覆盖约 {coveredCount.toLocaleString('zh-CN')} 个书签
        </span>
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
