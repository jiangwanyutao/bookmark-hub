import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'bookmark-hub:theme';

/** 手动选过就用手动的，否则跟随系统。 */
export const resolveTheme = (stored: string | null, systemDark: boolean): Theme =>
  stored === 'light' || stored === 'dark' ? stored : systemDark ? 'dark' : 'light';

const listeners = new Set<() => void>();
let current: Theme = 'light';

// localStorage 在隐私模式等场景可能不可用，读写失败只是记不住选择
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  listeners.forEach((listener) => listener());
}

/** 渲染前调用一次：设置 data-theme，并在没手动选过时跟随系统变化。 */
export function initTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  apply(resolveTheme(readStored(), media.matches));
  media.addEventListener('change', (e) => {
    if (!readStored()) apply(e.matches ? 'dark' : 'light');
  });
}

export function toggleTheme() {
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 记不住也能切换
  }
  apply(next);
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}
