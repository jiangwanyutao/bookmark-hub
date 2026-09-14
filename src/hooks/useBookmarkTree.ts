import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { TreeNode } from '../lib/bookmarks';

const RELOAD_DELAY_MS = 150;

/** 读取浏览器书签树，并在用户于浏览器中改动书签时自动刷新。 */
export function useBookmarkTree() {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bookmarks = browser?.bookmarks;

    // 非扩展环境（v0 预览、纯网页）没有 chrome.bookmarks API，喂入示例数据以便预览界面。
    // 真实扩展里该 API 一定存在，此分支不会触发。
    if (!bookmarks?.getTree) {
      let cancelled = false;
      void import('../lib/testing/sampleTree').then(({ sampleTree }) => {
        if (!cancelled) setTree(sampleTree);
      });
      return () => {
        cancelled = true;
      };
    }

    let importing = false;
    let timer: number | undefined;

    // ponytail: 任何改动都整树重读，5,000 条约几毫秒；若 10,000+ 条出现卡顿再改为增量更新
    const load = () =>
      bookmarks.getTree().then(
        (roots) => setTree(roots),
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      );
    const schedule = () => {
      if (importing) return;
      clearTimeout(timer);
      timer = window.setTimeout(load, RELOAD_DELAY_MS);
    };
    const onImportBegan = () => {
      importing = true;
    };
    const onImportEnded = () => {
      importing = false;
      void load();
    };

    const changeEvents = [
      bookmarks.onCreated,
      bookmarks.onRemoved,
      bookmarks.onChanged,
      bookmarks.onMoved,
      bookmarks.onChildrenReordered,
    ];

    void load();
    changeEvents.forEach((event) => event.addListener(schedule));
    // 导入事件只有 Chromium 系浏览器提供
    bookmarks.onImportBegan?.addListener(onImportBegan);
    bookmarks.onImportEnded?.addListener(onImportEnded);

    return () => {
      clearTimeout(timer);
      changeEvents.forEach((event) => event.removeListener(schedule));
      bookmarks.onImportBegan?.removeListener(onImportBegan);
      bookmarks.onImportEnded?.removeListener(onImportEnded);
    };
  }, []);

  return { tree, error };
}
