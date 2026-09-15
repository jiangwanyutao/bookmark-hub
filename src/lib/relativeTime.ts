const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RELATIVE_DAY_LIMIT = 30;

/** 按本地 0 点算的日历天差，避免「23 小时前」其实是昨天。 */
function dayDiff(then: number, now: number): number {
  const a = new Date(then);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** 「刚刚 / 12 分钟前 / 3 小时前 / 昨天 / 5 天前 / 2026/8/1」 */
export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < MIN) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  const days = dayDiff(ms, now);
  if (days === 0) return `${Math.floor(diff / HOUR)} 小时前`;
  if (days === 1) return '昨天';
  if (days < RELATIVE_DAY_LIMIT) return `${days} 天前`;
  return new Date(ms).toLocaleDateString('zh-CN');
}

/** 时间线的分组标题：「今天 / 昨天 / 9月12日」 */
export function dayLabel(ms: number, now: number = Date.now()): string {
  const days = dayDiff(ms, now);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return new Date(ms).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

/** 「14:20」，用于日期已由分组标题说明的项 */
export const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 按日历天把列表切成相邻的组，保持传入顺序（不排序）。 */
export function groupByDay<T>(items: T[], at: (item: T) => number, now: number = Date.now()): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(at(item), now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
