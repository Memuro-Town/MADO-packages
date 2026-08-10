import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { cols } from '@/lib/columns';
import { NextRequest, NextResponse } from 'next/server';

// 臨時の追加・除外の対象列を選ぶための一覧。
// residents/columns と違い、呼び出したadmin自身の許可列で絞らない
// （管理者は他人の権限を編集する立場であり、自分の許可範囲とは無関係のため）。
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  try {
    const rows = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = current_schema()
        ORDER BY ordinal_position`,
      cols.table
    );
    return NextResponse.json(rows.map(r => r.name));
  } catch (e) {
    console.error('[admin/columns] DB error:', e);
    return NextResponse.json({ error: 'エラー' }, { status: 500 });
  }
}
