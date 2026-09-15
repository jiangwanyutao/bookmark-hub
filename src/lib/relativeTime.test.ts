import { describe, expect, it } from 'vitest';
import { dayLabel, groupByDay, relativeTime } from './relativeTime';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

describe('relativeTime', () => {
  it('counts minutes and hours within the same day', () => {
    expect(relativeTime(at(14, 10, 0), at(14, 10, 0) + 30_000)).toBe('刚刚');
    expect(relativeTime(at(14, 9, 48), at(14, 10))).toBe('12 分钟前');
    expect(relativeTime(at(14, 7), at(14, 10))).toBe('3 小时前');
  });

  it('says 昨天 once midnight has passed, even if only a few hours ago', () => {
    expect(relativeTime(at(13, 22), at(14, 1))).toBe('昨天');
    // 不到一小时仍按分钟算
    expect(relativeTime(at(13, 23, 50), at(14, 0, 10))).toBe('20 分钟前');
  });

  it('counts days, then falls back to the date after 30 days', () => {
    expect(relativeTime(at(9, 12), at(14, 10))).toBe('5 天前');
    const old = new Date(2026, 6, 1, 12).getTime();
    expect(relativeTime(old, at(14, 10))).toBe(new Date(old).toLocaleDateString('zh-CN'));
  });
});

describe('groupByDay', () => {
  it('splits across days and keeps the given order', () => {
    const now = at(14, 18);
    const items = [at(14, 9), at(13, 20), at(14, 8)];
    const groups = groupByDay(items, (ms) => ms, now);

    expect(groups.map((g) => g.label)).toEqual(['今天', '昨天', '今天']);
    expect(groups[0]!.items).toEqual([at(14, 9)]);
  });

  it('merges adjacent items from the same day', () => {
    const now = at(14, 18);
    const groups = groupByDay([at(14, 9), at(14, 8), at(12, 8)], (ms) => ms, now);

    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['今天', 2],
      [dayLabel(at(12, 8), now), 1],
    ]);
  });
});
