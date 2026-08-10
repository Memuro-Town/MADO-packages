import { db } from '@/lib/db';
import { cols, q } from '@/lib/columns';
import { filterAllowedFields, type ColumnDependencyMap } from '@/lib/columnDependencies';
import { resolveAllowedColumnsForLogin } from '@/lib/permissions';
import { recordAuditLog } from '@/lib/auditLog';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

const { table, atena_code, household_code, name, name_kana, birthdate,
        relationship, resident_status, record_order } = cols;

// レスポンスのキー → 必要な実DB列名（residents/[id]と同じ考え方）
const HOUSEHOLD_MEMBER_DEPENDENCIES: ColumnDependencyMap = {
  'カナ氏名': [name_kana],
  '氏名': [name],
  '続柄': [relationship],
  '生年月日': [birthdate],
  '住民ｺｰﾄﾞ': [atena_code],
  '住民状態': [resident_status],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 世帯番号はDB上text型（先頭ゼロを持つ値がありうる）なので、数値に変換せず
  // 文字列のまま比較する。parseIntすると "0100" のような値が "100" に化けて
  // 一致しなくなる上、bigintとしてバインドされ text = bigint で実行時エラーになる。
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: '世帯番号が不正です' }, { status: 400 });
  }

  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const payload = token ? await verifySessionToken(token) : null;
    const allowed = await resolveAllowedColumnsForLogin(payload?.sub);
    // columns.json でDB列名が変わっても、APIレスポンスのキー名を固定する
    const rows = await db.$queryRawUnsafe<unknown[]>(
      `SELECT
         ${q(name_kana)}      AS "カナ氏名",
         ${q(name)}           AS "氏名",
         ${q(relationship)}   AS "続柄",
         ${q(birthdate)}      AS "生年月日",
         ${q(atena_code)}     AS "住民ｺｰﾄﾞ",
         ${q(resident_status)} AS "住民状態"
       FROM ${q(table)}
       WHERE ${q(household_code)} = $1
       ORDER BY ${q(record_order)} ASC`,
      id
    );

    const filtered = (rows ?? []).map(row =>
      filterAllowedFields(row as Record<string, unknown>, HOUSEHOLD_MEMBER_DEPENDENCIES, allowed)
    );

    // 世帯は複数人が対象になるため target は付けず、世帯番号と構成員の宛名番号を
    // detail に残す。
    if (payload && filtered.length > 0) {
      await recordAuditLog({
        actor: payload,
        action: 'household.view',
        detail: {
          householdCode: id,
          memberAtenaCodes: filtered.map(f => f['住民ｺｰﾄﾞ']).filter(v => v !== undefined),
        },
        request,
      });
    }

    return NextResponse.json(filtered);
  } catch (e) {
    console.error('[households/[id]] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
