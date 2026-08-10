import { db } from '@/lib/db';
import { cols, q } from '@/lib/columns';
import { parseSearchInput } from '@/lib/date';
import { recordAuditLog } from '@/lib/auditLog';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

function toKatakana(str: string): string {
  return str.replace(/[ぁ-ゖ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

const { table, atena_code, household_code, name, name_kana, birthdate,
        address_town, address_banchi, resident_status } = cols;

// columns.json でDB列名が変わっても、APIレスポンスのキー名を固定する
const SELECT_COLS = `
  SELECT
    ${q(atena_code)}   AS "宛名番号",
    ${q(household_code)} AS "世帯番号",
    ${q(name)}         AS "氏名",
    ${q(name_kana)}    AS "氏名_フリガナ",
    ${q(birthdate)}    AS "生年月日",
    COALESCE(${q(address_town)}::text, '') || COALESCE(${q(address_banchi)}::text, '') AS "住所",
    ${q(resident_status)} AS "住民状態"
  FROM ${q(table)}`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.get('q')?.trim();

  if (!qs) {
    return NextResponse.json({ error: '検索値を入力してください' }, { status: 400 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  try {
    let rows: unknown[];

    if (!/^\d+$/.test(qs)) {
      const normalized = qs.replace(/[ 　]/g, '');
      const kana = toKatakana(normalized);
      rows = await db.$queryRawUnsafe<unknown[]>(
        `${SELECT_COLS}
         WHERE REPLACE(REPLACE(${q(name)}, ' ', ''), '　', '') LIKE $1
            OR REPLACE(REPLACE(${q(name_kana)}, ' ', ''), '　', '') LIKE $2
            OR REPLACE(REPLACE(${q(name_kana)}, ' ', ''), '　', '') LIKE $3
         ORDER BY ${q(name_kana)} ASC
         LIMIT 50`,
        `%${normalized}%`, `%${normalized}%`, `%${kana}%`
      );
    } else {
      const parsed = parseSearchInput(qs);
      if (!parsed) {
        return NextResponse.json({ error: '入力形式が正しくありません' }, { status: 400 });
      }

      if (parsed.type === 'birthdate') {
        const alt = parsed.date.replace(/-/g, '/');
        rows = await db.$queryRawUnsafe<unknown[]>(
          `${SELECT_COLS}
           WHERE (${q(birthdate)} LIKE $1 OR ${q(birthdate)} LIKE $2)
           ORDER BY ${q(name_kana)} ASC
           LIMIT 50`,
          `${parsed.date}%`,
          `${alt}%`
        );
      } else {
        rows = await db.$queryRawUnsafe<unknown[]>(
          `${SELECT_COLS}
           WHERE ${q(atena_code)} = $1`,
          parsed.code
        );
      }
    }

    const results = rows ?? [];

    // 検索は対象を1件に絞れない操作のため target は付けず、
    // マッチした宛名番号一覧を detail に残す（誰が・何を探したかの記録）。
    if (payload) {
      await recordAuditLog({
        actor: payload,
        action: 'resident.search',
        detail: {
          query: qs,
          resultCount: results.length,
          matchedAtenaCodes: results.map(r => (r as { 宛名番号: number }).宛名番号),
        },
        request,
      });
    }

    return NextResponse.json(results);
  } catch (e) {
    console.error('[residents/search] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
