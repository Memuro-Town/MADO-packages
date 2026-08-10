// 実効的な閲覧可能列の計算
//
// 計算ロジック（computeAllowedColumns）はDBに触れない純粋関数として分離している。
// PostgreSQLの起動なしにユニットテストできるようにするため。
//
// 有効な閲覧範囲 =
//   Σ(期限内・未取消のグループ割り当てを展開した列)
//   + Σ(期限内・未取消の追加(add)例外)
//   - Σ(期限内・未取消の除外(remove)例外)
//
// 除外(remove)は追加(add)より強い（同じ列に両方あれば見せない）。
import { db } from './db';
import { expandGroupColumns } from './permissionGroups';

export interface GrantLike {
  groupId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ExceptionLike {
  effect: string; // 'add' | 'remove'
  tableName: string;
  columnName: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** 指定時刻 at においてまだ有効か（未取消・期限内）を判定する */
function isActiveAt(expiresAt: Date, revokedAt: Date | null, at: Date): boolean {
  if (revokedAt !== null) return false;
  return expiresAt.getTime() > at.getTime();
}

/**
 * grants・exceptions から、時刻 at 時点で有効な閲覧可能列の集合を計算する。
 * DBに一切アクセスしない純粋関数。
 */
export function computeAllowedColumns(
  grants: GrantLike[],
  exceptions: ExceptionLike[],
  at: Date
): Set<string> {
  const allowed = new Set<string>();

  for (const grant of grants) {
    if (!isActiveAt(grant.expiresAt, grant.revokedAt, at)) continue;
    for (const column of expandGroupColumns(grant.groupId)) {
      allowed.add(column);
    }
  }

  const removed = new Set<string>();
  for (const exception of exceptions) {
    if (!isActiveAt(exception.expiresAt, exception.revokedAt, at)) continue;
    if (exception.effect === 'add') {
      allowed.add(exception.columnName);
    } else if (exception.effect === 'remove') {
      removed.add(exception.columnName);
    }
  }

  // remove は add より強い
  for (const column of removed) {
    allowed.delete(column);
  }

  return allowed;
}

/** DBから該当ユーザーの grants・exceptions を引いて実効的な閲覧可能列を返す */
export async function resolveAllowedColumns(
  userId: number,
  at: Date = new Date()
): Promise<Set<string>> {
  const [grants, exceptions] = await Promise.all([
    db.permissionGrant.findMany({ where: { userId } }),
    db.permissionException.findMany({ where: { userId } }),
  ]);

  return computeAllowedColumns(grants, exceptions, at);
}

/**
 * セッションJWTの sub（loginId）から実効的な閲覧可能列を返す。
 * APIルートはJWTにloginIdしか持たない（numeric userIdはDB専用の内部ID）ため、
 * ルート側で毎回 user を引く二度手間を避けるためのラッパー。
 * 未ログイン・該当ユーザーなしの場合は空集合を返す（＝何も見せない）。
 */
export async function resolveAllowedColumnsForLogin(
  loginId: string | undefined,
  at: Date = new Date()
): Promise<Set<string>> {
  if (!loginId) return new Set();

  const user = await db.user.findUnique({ where: { loginId } });
  if (!user) return new Set();

  return resolveAllowedColumns(user.id, at);
}
