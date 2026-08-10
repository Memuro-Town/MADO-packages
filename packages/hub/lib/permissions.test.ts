import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    permissionGrant: { findMany: vi.fn() },
    permissionException: { findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import {
  computeAllowedColumns,
  resolveAllowedColumnsForLogin,
  type GrantLike,
  type ExceptionLike,
} from '@/lib/permissions';

const AT = new Date(2026, 6, 1); // 基準時刻: 2026-07-01（実時間に依存させない）

function grant(overrides: Partial<GrantLike> = {}): GrantLike {
  return {
    groupId: 'resident_basic',
    expiresAt: new Date(2027, 2, 31, 23, 59, 59, 999),
    revokedAt: null,
    ...overrides,
  };
}

function exception(overrides: Partial<ExceptionLike> = {}): ExceptionLike {
  return {
    effect: 'add',
    tableName: 'resident_table',
    columnName: '列X',
    expiresAt: new Date(2027, 2, 31, 23, 59, 59, 999),
    revokedAt: null,
    ...overrides,
  };
}

describe('computeAllowedColumns', () => {
  it('grantが1件も無いユーザーは空集合になる', () => {
    const result = computeAllowedColumns([], [], AT);
    expect(result.size).toBe(0);
  });

  it('期限切れのgrantは除外される', () => {
    const expired = grant({ expiresAt: new Date(2026, 0, 1) }); // ATより前
    const result = computeAllowedColumns([expired], [], AT);
    expect(result.size).toBe(0);
  });

  it('取消済み(revokedAt)のgrantは除外される', () => {
    const revoked = grant({ revokedAt: new Date(2026, 5, 1) });
    const result = computeAllowedColumns([revoked], [], AT);
    expect(result.size).toBe(0);
  });

  it('有効なgrantがあれば、そのグループの列が含まれる', () => {
    const result = computeAllowedColumns([grant()], [], AT);
    expect(result.has('宛名番号')).toBe(true);
    expect(result.has('氏名')).toBe(true);
  });

  it('addの例外で列が増える', () => {
    const result = computeAllowedColumns([], [exception({ effect: 'add', columnName: '臨時列A' })], AT);
    expect(result.has('臨時列A')).toBe(true);
  });

  it('removeの例外で列が減る（グループが許可していても消える）', () => {
    const result = computeAllowedColumns(
      [grant()],
      [exception({ effect: 'remove', columnName: '氏名' })],
      AT
    );
    expect(result.has('氏名')).toBe(false);
    // 他の列には影響しない
    expect(result.has('宛名番号')).toBe(true);
  });

  it('removeがaddに勝つ（同じ列に両方あれば見せない）', () => {
    const result = computeAllowedColumns(
      [],
      [
        exception({ effect: 'add', columnName: '列Y' }),
        exception({ effect: 'remove', columnName: '列Y' }),
      ],
      AT
    );
    expect(result.has('列Y')).toBe(false);
  });

  it('期限切れの例外は無視される', () => {
    const result = computeAllowedColumns(
      [],
      [exception({ effect: 'add', columnName: '期限切れ列', expiresAt: new Date(2026, 0, 1) })],
      AT
    );
    expect(result.has('期限切れ列')).toBe(false);
  });

  it('取消済みの例外は無視される', () => {
    const result = computeAllowedColumns(
      [grant()],
      [exception({ effect: 'remove', columnName: '氏名', revokedAt: new Date(2026, 5, 1) })],
      AT
    );
    // 例外が無効化されているので、grantの許可がそのまま生きる
    expect(result.has('氏名')).toBe(true);
  });
});

describe('resolveAllowedColumnsForLogin', () => {
  it('loginIdがundefined（未ログイン）なら空集合を返し、DBを引かない', async () => {
    const result = await resolveAllowedColumnsForLogin(undefined);
    expect(result.size).toBe(0);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('該当ユーザーが存在しなければ空集合を返す', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
    const result = await resolveAllowedColumnsForLogin('存在しないID');
    expect(result.size).toBe(0);
  });

  it('該当ユーザーのuserIdでgrant/exceptionを引いて計算する', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ id: 42 } as never);
    vi.mocked(db.permissionGrant.findMany).mockResolvedValueOnce([grant()] as never);
    vi.mocked(db.permissionException.findMany).mockResolvedValueOnce([] as never);

    const result = await resolveAllowedColumnsForLogin('test01', AT);

    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { loginId: 'test01' } });
    expect(db.permissionGrant.findMany).toHaveBeenCalledWith({ where: { userId: 42 } });
    expect(result.has('氏名')).toBe(true);
  });
});
