import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
/** 用户的选择：浅色 / 深色 / 跟随系统 */
export type ThemePref = Theme | 'system';

const STORAGE_KEY = 'bookmark-hub:theme';

/** 手动选过就用手动的，否则跟随系统。 */
export const resolveTheme = (stored: string | null, systemDark: boolean): Theme =>
  stored === 'light' || stored === 'dark' ? stored : systemDark ? 'dark' : 'light';

const listeners = new Set<() => void>();
let current: Theme = 'light';
let pref: ThemePref = 'system';
let media: MediaQueryList | undefined;

// localStorage 在隐私模式等场景可能不可用，读写失败只是记不住选择
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function apply() {
  current = resolveTheme(pref, media?.matches ?? false);
  document.documentElement.dataset.theme = current;
  listeners.forEach((listener) => listener());
}

/** 渲染前调用一次：设置 data-theme，并在「跟随系统」时响应系统变化。 */
export function initTheme() {
  media = window.matchMedia('(prefers-color-scheme: dark)');
  const stored = readStored();
  pref = stored === 'light' || stored === 'dark' ? stored : 'system';
  apply();
  media.addEventListener('change', () => {
    if (pref === 'system') apply();
  });
}

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 记不住也能切换
  }
  apply();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 实际生效的主题 */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => current);

/** 用户选择的主题（含跟随系统） */
export const useThemePref = (): ThemePref => useSyncExternalStore(subscribe, () => pref);
