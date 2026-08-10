import { describe, it, expect } from 'vitest';
import { nextFiscalYearEnd } from '@/lib/fiscalYear';

describe('nextFiscalYearEnd', () => {
  it('4月〜12月は翌年の3月31日を返す', () => {
    expect(nextFiscalYearEnd(new Date(2026, 3, 1)).getFullYear()).toBe(2027); // 4月
    expect(nextFiscalYearEnd(new Date(2026, 6, 15)).getFullYear()).toBe(2027); // 7月
    expect(nextFiscalYearEnd(new Date(2026, 11, 31)).getFullYear()).toBe(2027); // 12月
  });

  it('1月〜3月は同年の3月31日を返す', () => {
    expect(nextFiscalYearEnd(new Date(2026, 0, 1)).getFullYear()).toBe(2026); // 1月
    expect(nextFiscalYearEnd(new Date(2026, 1, 15)).getFullYear()).toBe(2026); // 2月
    expect(nextFiscalYearEnd(new Date(2026, 2, 31)).getFullYear()).toBe(2026); // 3月
  });

  it('結果は常に3月31日を指す', () => {
    const result = nextFiscalYearEnd(new Date(2026, 5, 10));
    expect(result.getMonth()).toBe(2); // 3月 (0-indexed)
    expect(result.getDate()).toBe(31);
  });

  it('年度境界: 3月31日当日を渡すと同年の3月31日を返す', () => {
    const result = nextFiscalYearEnd(new Date(2026, 2, 31, 10, 0, 0));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(31);
  });

  it('年度境界: 4月1日当日を渡すと翌年の3月31日を返す', () => {
    const result = nextFiscalYearEnd(new Date(2026, 3, 1, 0, 0, 0));
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(31);
  });

  it('返る時刻はその日の終わり（23:59:59.999）である', () => {
    const result = nextFiscalYearEnd(new Date(2026, 5, 10));
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it('引数省略時は現在時刻を基準にする', () => {
    // 実時間に依存させないよう vi.useFakeTimers ではなく、境界を跨がない
    // 範囲の検証のみ行う: 少なくとも呼び出し時点以降の日付が返ることを確認する。
    const before = new Date();
    const result = nextFiscalYearEnd();
    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
