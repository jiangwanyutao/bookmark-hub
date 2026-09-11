import { useEffect, useSyncExternalStore } from 'react';
import type { TreeNode } from '@/lib/bookmarks';
import { createAgentModel } from '@/lib/agent/model';
import { createOrganizeStore } from '@/lib/agent/store';

// 模块级：切换 Dashboard 页面不丢会话；工具通过 getter 读取最新书签树和标签
const environment: { roots: TreeNode[]; tags: Map<string, string[]> } = { roots: [], tags: new Map() };

const store = createOrganizeStore({
  getRoots: () => environment.roots,
  getTags: () => environment.tags,
  createModel: createAgentModel,
});

export function useOrganizeAgent(roots: TreeNode[], tags: Map<string, string[]>) {
  useEffect(() => {
    environment.roots = roots;
    environment.tags = tags;
  }, [roots, tags]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { state, store };
}
