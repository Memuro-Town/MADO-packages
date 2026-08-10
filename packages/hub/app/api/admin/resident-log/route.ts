import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { NextRequest, NextResponse } from 'next/server';

// 住民データ監査ログの点検・決裁用ビューのデータ元。日付範囲（両端含む）で返す。
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');

  const from = fromParam ? new Date(`${fromParam}T00:00:00`) : null;
  const to = toParam ? new Date(`${toParam}T00:00:00`) : null;
  if (to) to.setDate(to.getDate() + 1);

  if ((fromParam && isNaN(from!.getTime())) || (toParam && isNaN(to!.getTime()))) {
    return NextResponse.json({ error: '日付の形式が不正です' }, { status: 400 });
  }

  try {
    const logs = await db.auditLog.findMany({
      where: {
        ...(from || to
          ? { at: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      },
      orderBy: { at: 'asc' },
    });

    return NextResponse.json(
      logs.map(log => ({
        id: log.id,
        at: log.at,
        actorLogin: log.actorLogin,
        actorName: log.actorName,
        actorDept: log.actorDept,
        action: log.action,
        targetAtenaCode: log.targetAtenaCode,
        detail: log.detail,
      }))
    );
  } catch (e) {
    console.error('[admin/resident-log] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
