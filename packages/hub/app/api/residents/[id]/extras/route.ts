import { db } from '@/lib/db';
import { cols, q } from '@/lib/columns';
import { resolveAllowedColumnsForLogin } from '@/lib/permissions';
import { recordAuditLog } from '@/lib/auditLog';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

(BigInt.prototype as unknown as Record<string, unknown>).toJSON = function () {
  return this.toString();
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

  const requestedCols = (request.nextUrl.searchParams.get('cols') ?? '')
    .split(',').map(c => c.trim()).filter(Boolean);
  if (requestedCols.length === 0) return NextResponse.json({});

  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const payload = token ? await verifySessionToken(token) : null;
    const allowed = await resolveAllowedColumnsForLogin(payload?.sub);

    // カラム名をinformation_schemaで検証してSQLインジェクションを防ぐ
    const schema = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = current_schema()
        ORDER BY ordinal_position`,
      cols.table
    );
    const valid = new Set(schema.map(r => r.name));
    const safe = requestedCols.filter(c => valid.has(c) && allowed.has(c));
    if (safe.length === 0) return NextResponse.json({});

    const selectCols = safe.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${selectCols} FROM ${q(cols.table)} WHERE ${q(cols.atena_code)} = $1`,
      atenaCode
    );

    if (payload && rows[0]) {
      await recordAuditLog({
        actor: payload,
        action: 'resident.view_extra',
        targetAtenaCode: atenaCode,
        detail: { columns: safe },
        request,
      });
    }

    return NextResponse.json(rows[0] ?? {});
  } catch (e) {
    console.error('[extras] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
