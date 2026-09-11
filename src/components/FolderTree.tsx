import { useState } from 'react';
import type { TreeNode } from '../lib/bookmarks';

interface Shared {
  countByFolder: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const isFolder = (node: TreeNode) => node.url === undefined;

export function FolderTree({ roots, ...shared }: Shared & { roots: TreeNode[] }) {
  const root = roots[0];
  if (!root) return null;

  return (
    <nav className="folders" aria-label="文件夹">
      <button
        className={`folder-btn ${shared.selectedId === null ? 'active' : ''}`}
        onClick={() => shared.onSelect(null)}
      >
        <span className="name">全部书签</span>
        <span className="num">{shared.countByFolder.get(root.id) ?? 0}</span>
      </button>
      <ul>
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
      <div className="folder-row" style={{ paddingLeft: depth * 14 }}>
        {subfolders.length > 0 ? (
          <button
            className="toggle"
            aria-label={open ? `收起 ${node.title}` : `展开 ${node.title}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="toggle" />
        )}
        <button
          className={`folder-btn ${shared.selectedId === node.id ? 'active' : ''}`}
          onClick={() => shared.onSelect(node.id)}
        >
          <span className="name">{node.title}</span>
          <span className="num">{shared.countByFolder.get(node.id) ?? 0}</span>
        </button>
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
