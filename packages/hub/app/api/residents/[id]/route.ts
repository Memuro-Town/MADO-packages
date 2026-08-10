import { db } from '@/lib/db';
import { cols, q } from '@/lib/columns';
import { filterAllowedFields, type ColumnDependencyMap } from '@/lib/columnDependencies';
import { resolveAllowedColumnsForLogin } from '@/lib/permissions';
import { recordAuditLog } from '@/lib/auditLog';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

const { table, atena_code, household_code, name, name_kana, birthdate, gender,
        household_head_name, address_city, address_town, address_banchi,
        address_kata, address_city_code, postal_code, honseki, honseki_banchi, koseki_head_surname,
        koseki_head_given_name, resident_status } = cols;

// レスポンスのキー（APIレスポンスのキー名）→ そのために必要な実DB列名。
// 「本籍住所＋番地」「筆頭者」のように複数列を連結して作る項目は、
// 元の列すべてが許可されていないと出力しない。
const RESIDENT_DETAIL_DEPENDENCIES: ColumnDependencyMap = {
  '氏名': [name],
  'カナ氏名': [name_kana],
  '生年月日': [birthdate],
  '性別': [gender],
  '世帯主名': [household_head_name],
  '市町村名': [address_city],
  '住所': [address_town, address_banchi],
  '番地': [address_banchi],
  '方書': [address_kata],
  '行政区コード': [address_city_code],
  '郵便番号': [postal_code],
  '本籍住所＋番地': [honseki, honseki_banchi],
  '筆頭者': [koseki_head_surname, koseki_head_given_name],
  '住民ｺｰﾄﾞ': [atena_code],
  '世帯ｺｰﾄﾞ': [household_code],
  '住民状態': [resident_status],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const atenaCode = parseInt(id, 10);
  if (isNaN(atenaCode)) {
    return NextResponse.json({ error: '宛名番号が不正です' }, { status: 400 });
  }

  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const payload = token ? await verifySessionToken(token) : null;
    const allowed = await resolveAllowedColumnsForLogin(payload?.sub);
    // columns.json でDB列名が変わっても、APIレスポンスのキー名を固定する
    const rows = await db.$queryRawUnsafe<unknown[]>(
      `SELECT
         ${q(name)}              AS "氏名",
         ${q(name_kana)}         AS "カナ氏名",
         ${q(birthdate)}         AS "生年月日",
         ${q(gender)}            AS "性別",
         ${q(household_head_name)} AS "世帯主名",
         COALESCE(${q(address_city)}::text, '')  AS "市町村名",
         COALESCE(${q(address_town)}::text, '') || COALESCE(${q(address_banchi)}::text, '') AS "住所",
         COALESCE(${q(address_banchi)}::text, '') AS "番地",
         COALESCE(${q(address_kata)}::text, '')  AS "方書",
         COALESCE(${q(address_city_code)}::text, '') AS "行政区コード",
         COALESCE(${q(postal_code)}::text, '')   AS "郵便番号",
         COALESCE(${q(honseki)}::text, '') || COALESCE(${q(honseki_banchi)}::text, '') AS "本籍住所＋番地",
         COALESCE(${q(koseki_head_surname)}::text, '') || ' ' || COALESCE(${q(koseki_head_given_name)}::text, '') AS "筆頭者",
         ${q(atena_code)}        AS "住民ｺｰﾄﾞ",
         ${q(household_code)}    AS "世帯ｺｰﾄﾞ",
         ${q(resident_status)}   AS "住民状態"
       FROM ${q(table)}
       WHERE ${q(atena_code)} = $1`,
      atenaCode
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: '該当者が見つかりません' }, { status: 404 });
    }

    const row = rows[0] as Record<string, unknown>;
    const visible = filterAllowedFields(row, RESIDENT_DETAIL_DEPENDENCIES, allowed);

    // フィルタ後に何も見せていない（権限が無い等）場合は、実質的に住民情報を
    // 閲覧させていないため記録しない。
    if (payload && Object.keys(visible).length > 0) {
      await recordAuditLog({
        actor: payload,
        action: 'resident.view',
        targetAtenaCode: atenaCode,
        detail: { fields: Object.keys(visible) },
        request,
      });
    }

    return NextResponse.json(visible);
  } catch (e) {
    console.error('[residents/[id]] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
