import { describe, it, expect } from 'vitest';
import { computeDailyDigest, canonicalizeLogRow, stableStringify, GENESIS_DIGEST, type AuditLogRowLike } from '@/lib/auditDigest';

function row(overrides: Partial<AuditLogRowLike> = {}): AuditLogRowLike {
  return {
    id: 1,
    at: new Date('2026-07-30T05:00:00.000Z'),
    actorLogin: 'sato-taro',
    actorName: '佐藤太郎',
    actorDept: '住民課',
    action: 'resident.view',
    targetAtenaCode: 12345,
    detail: { columns: ['氏名', '住所'] },
    ip: '192.168.1.10',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

describe('stableStringify', () => {
  it('オブジェクトのキー順序に関わらず同じ文字列になる', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('ネストしたオブジェクトも再帰的にキーがソートされる', () => {
    const a = stableStringify({ x: { d: 1, c: 2 }, y: 1 });
    const b = stableStringify({ y: 1, x: { c: 2, d: 1 } });
    expect(a).toBe(b);
  });

  it('配列内の要素の順序は保持する（並び替えない）', () => {
    const result = stableStringify({ list: [3, 1, 2] });
    expect(result).toBe('{"list":[3,1,2]}');
  });

  it('nullとundefinedを区別する', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify({ a: null })).toBe('{"a":null}');
  });
});

describe('canonicalizeLogRow', () => {
  it('detailのキー順序が異なっても同じ結果になる（JSONBのキー順不定への対策）', () => {
    const a = canonicalizeLogRow(row({ detail: { b: 1, a: 2 } }));
    const b = canonicalizeLogRow(row({ detail: { a: 2, b: 1 } }));
    expect(a).toBe(b);
  });

  it('1つでもフィールドが変わると結果も変わる', () => {
    const a = canonicalizeLogRow(row({ actorLogin: 'sato-taro' }));
    const b = canonicalizeLogRow(row({ actorLogin: 'suzuki-jiro' }));
    expect(a).not.toBe(b);
  });
});

describe('computeDailyDigest', () => {
  it('同じ入力なら何度計算しても同じダイジェストになる（決定的）', () => {
    const rows = [row({ id: 1 }), row({ id: 2, actorLogin: 'suzuki-jiro' })];
    const a = computeDailyDigest(GENESIS_DIGEST, rows);
    const b = computeDailyDigest(GENESIS_DIGEST, rows);
    expect(a).toBe(b);
  });

  it('前日のダイジェストが違えば結果も変わる（数珠つなぎになっている）', () => {
    const rows = [row()];
    const a = computeDailyDigest(GENESIS_DIGEST, rows);
    const b = computeDailyDigest('別の前日ダイジェスト', rows);
    expect(a).not.toBe(b);
  });

  it('前日のダイジェストがnullの場合はGENESIS_DIGESTを使ったときと同じ結果になる', () => {
    const rows = [row()];
    const a = computeDailyDigest(null, rows);
    const b = computeDailyDigest(GENESIS_DIGEST, rows);
    expect(a).toBe(b);
  });

  it('1行でも内容が変わればその日のダイジェストが変わる（改ざん検知の核心）', () => {
    const original = [row({ id: 1, targetAtenaCode: 12345 })];
    const tampered = [row({ id: 1, targetAtenaCode: 99999 })];
    const a = computeDailyDigest(GENESIS_DIGEST, original);
    const b = computeDailyDigest(GENESIS_DIGEST, tampered);
    expect(a).not.toBe(b);
  });

  it('行の順序が変わるとダイジェストも変わる（並び順もチェーンの一部）', () => {
    const rows1 = [row({ id: 1 }), row({ id: 2, actorLogin: 'suzuki-jiro' })];
    const rows2 = [row({ id: 2, actorLogin: 'suzuki-jiro' }), row({ id: 1 })];
    const a = computeDailyDigest(GENESIS_DIGEST, rows1);
    const b = computeDailyDigest(GENESIS_DIGEST, rows2);
    expect(a).not.toBe(b);
  });

  it('その日にログが0件でも前日のダイジェストから決定的に計算できる', () => {
    const a = computeDailyDigest(GENESIS_DIGEST, []);
    const b = computeDailyDigest(GENESIS_DIGEST, []);
    expect(a).toBe(b);
    expect(a).not.toBe(GENESIS_DIGEST);
  });
});
