import { useState } from 'react';
import { ChevronRight, Folder, Library } from 'lucide-react';
import type { TreeNode } from '@/lib/bookmarks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Shared {
  countByFolder: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const isFolder = (node: TreeNode) => node.url === undefined;
const INDENT_PX = 14;

function FolderButton({
  active,
  icon,
  name,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  name: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('min-w-0 flex-1 justify-start font-normal', active && 'bg-accent font-medium text-accent-foreground hover:bg-accent')}
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{name}</span>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
    </Button>
  );
}

export function FolderTree({ roots, ...shared }: Shared & { roots: TreeNode[] }) {
  const root = roots[0];
  if (!root) return null;

  return (
    <nav aria-label="文件夹" className="overflow-auto border-r bg-muted/30 p-2">
      <p className="px-2 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">目录</p>
      <FolderButton
        active={shared.selectedId === null}
        icon={<Library />}
        name="全部书签"
        count={shared.countByFolder.get(root.id) ?? 0}
        onClick={() => shared.onSelect(null)}
      />
      <ul className="mt-1">
        {(root.children ?? []).filter(isFolder).map((node) => (
          <FolderNode key={node.id} node={node} depth={0} {...shared} />
        ))}
      </ul>
    </nav>
  );
}

function FolderNode({ node, depth, ...shared }: Shared & { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const subfolders = (node.children ?? []).filter(isFolder);

  return (
    <li>
      <div className="flex items-center" style={{ paddingLeft: depth * INDENT_PX }}>
        {subfolders.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            aria-label={open ? `收起 ${node.title}` : `展开 ${node.title}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronRight className={cn('transition-transform', open && 'rotate-90')} />
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <FolderButton
          active={shared.selectedId === node.id}
          icon={<Folder className="text-muted-foreground" />}
          name={node.title}
          count={shared.countByFolder.get(node.id) ?? 0}
          onClick={() => shared.onSelect(node.id)}
        />
      </div>
      {open && subfolders.length > 0 && (
        <ul>
          {subfolders.map((child) => (
            <FolderNode key={child.id} node={child} depth={depth + 1} {...shared} />
          ))}
        </ul>
      )}
    </li>
  );
}
