import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { NextRequest, NextResponse } from 'next/server';

// 日次ダイジェストのチェーンを新しい順に表示する（アンカー先へ渡す値の確認用）。
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  try {
    const digests = await db.dailyDigest.findMany({
      orderBy: { date: 'desc' },
      take: 100,
    });

    return NextResponse.json(
      digests.map(d => ({
        date: d.date,
        digest: d.digest,
        rowCount: d.rowCount,
        computedAt: d.computedAt,
      }))
    );
  } catch (e) {
    console.error('[admin/daily-digests] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
