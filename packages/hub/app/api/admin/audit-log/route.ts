import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { NextRequest, NextResponse } from 'next/server';

// 決裁用印刷ビューのデータ元。日付範囲（両端含む、ローカル日付基準）で操作記録を返す。
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');

  const from = fromParam ? new Date(`${fromParam}T00:00:00`) : null;
  // to は指定日の終わりまで含める（翌日0時未満）
  const to = toParam ? new Date(`${toParam}T00:00:00`) : null;
  if (to) to.setDate(to.getDate() + 1);

  if ((fromParam && isNaN(from!.getTime())) || (toParam && isNaN(to!.getTime()))) {
    return NextResponse.json({ error: '日付の形式が不正です' }, { status: 400 });
  }

  try {
    const logs = await db.adminAuditLog.findMany({
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
        targetLogin: log.targetLogin,
        detail: log.detail,
      }))
    );
  } catch (e) {
    console.error('[admin/audit-log] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
