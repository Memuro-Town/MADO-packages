import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { extendGrant } from '@/lib/grantActions';
import { NextRequest, NextResponse } from 'next/server';

// 期限運用画面の「一括継続」。複数の付与IDを翌年度末まで一括延長する。
// 1件ずつ extendGrant() を呼ぶため、AdminAuditLog には対象ごとに1行ずつ記録される
// （個人の権限詳細画面から見たときに履歴として自然に繋がるようにするため）。
export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request);
  if (!actor) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { grantIds?: unknown } | null;
  const grantIds = Array.isArray(body?.grantIds)
    ? body.grantIds.filter((v): v is number => typeof v === 'number')
    : [];
  if (grantIds.length === 0) {
    return NextResponse.json({ error: '対象を1件以上選択してください' }, { status: 400 });
  }

  try {
    const grants = await db.permissionGrant.findMany({
      where: { id: { in: grantIds }, revokedAt: null },
      include: { user: true },
    });

    const extended = await Promise.all(grants.map(grant => extendGrant(grant, actor, request)));

    const notFoundCount = grantIds.length - grants.length;
    return NextResponse.json({
      extendedCount: extended.length,
      notFoundCount,
    });
  } catch (e) {
    console.error('[admin/expirations/bulk-extend] error:', e);
    return NextResponse.json({ error: '一括継続に失敗しました' }, { status: 500 });
  }
}
