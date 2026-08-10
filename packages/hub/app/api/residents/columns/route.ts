import { db } from '@/lib/db';
import { cols } from '@/lib/columns';
import { resolveAllowedColumnsForLogin } from '@/lib/permissions';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const payload = token ? await verifySessionToken(token) : null;
    const allowed = await resolveAllowedColumnsForLogin(payload?.sub);

    const rows = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = current_schema()
        ORDER BY ordinal_position`,
      cols.table
    );
    return NextResponse.json(rows.map(r => r.name).filter(name => allowed.has(name)));
  } catch (e) {
    console.error('[columns] DB error:', e);
    return NextResponse.json({ error: 'エラー' }, { status: 500 });
  }
}
