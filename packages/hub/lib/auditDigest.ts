// 監査ログの日次ダイジェスト計算。
//
// その日のダイジェスト = SHA-256( 前日のダイジェスト + "\n" + その日の全audit_log行を正規化直列化したもの )
//
// ⚠️ 正規化直列化のルール（canonicalizeLogRow / stableStringify）は、一度アンカーした日の
// ダイジェストを後から再計算して検証する際の前提になる。**このルールを後から変更してはいけない。**
// 変更すると、過去のダイジェストが「改ざんされていないのに再計算結果が一致しない」状態になり、
// 改ざん検知の仕組みそのものが意味を失う（壁打ち記録§2-2で警告されていた「正規化の不安定さ」の実例）。
// 将来どうしても変更が必要な場合は、フォーマットにバージョン番号を持たせ、
// 既存日はv1のロジックのまま検証できるようにすること。
import crypto from 'crypto';

// 「前日のダイジェストが存在しない最初の日」に使う固定値。
// この文字列自体に意味はなく、チェーンの起点を表す定数として固定するだけでよい。
export const GENESIS_DIGEST = 'MADO-hub-audit-log-genesis-v1';

export interface AuditLogRowLike {
  id: number;
  at: Date;
  actorLogin: string;
  actorName: string;
  actorDept: string;
  action: string;
  targetAtenaCode: number | null;
  detail: unknown;
  ip: string | null;
  userAgent: string | null;
}

/**
 * オブジェクトのキーをすべて再帰的にソートしてから JSON.stringify する。
 * detail は Postgres の JSONB を経由するため、挿入時のキー順が保持される保証がない
 * （JSONBは正規化されて格納される）。キー順に依存しない直列化にすることで、
 * 「中身は同じだが書き込み時と読み出し時でキー順が変わり、ダイジェストがズレる」
 * という誤検知を防ぐ。
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
  );
  return `{${entries.join(',')}}`;
}

/** audit_log の1行を、ダイジェスト計算に使う固定フォーマットの文字列にする */
export function canonicalizeLogRow(row: AuditLogRowLike): string {
  return stableStringify({
    id: row.id,
    at: row.at.toISOString(),
    actorLogin: row.actorLogin,
    actorName: row.actorName,
    actorDept: row.actorDept,
    action: row.action,
    targetAtenaCode: row.targetAtenaCode,
    detail: row.detail,
    ip: row.ip,
    userAgent: row.userAgent,
  });
}

/**
 * 前日のダイジェストと、その日の全行（id昇順で渡すこと）からその日のダイジェストを計算する。
 * DBに一切アクセスしない純粋関数。
 */
export function computeDailyDigest(
  previousDigest: string | null,
  rows: AuditLogRowLike[]
): string {
  const canonicalRows = rows.map(canonicalizeLogRow).join('\n');
  const input = `${previousDigest ?? GENESIS_DIGEST}\n${canonicalRows}`;
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}
