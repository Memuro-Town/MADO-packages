import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { PERMISSION_GROUPS } from '@/lib/permissionGroups';
import { NextRequest, NextResponse } from 'next/server';

// 期限切れ間近／期限切れ済みの権限グループ付与を一覧表示する（人事異動のタイミングで見る画面）。
// 「間近」の既定閾値は30日。取消済みの付与は対象外（既に無効なので継続の意味がない）。
const DEFAULT_THRESHOLD_DAYS = 30;

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const daysParam = request.nextUrl.searchParams.get('days');
  const thresholdDays = daysParam && !isNaN(Number(daysParam)) ? Number(daysParam) : DEFAULT_THRESHOLD_DAYS;

  try {
    const now = new Date();
    const threshold = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000);

    const grants = await db.permissionGrant.findMany({
      where: { revokedAt: null, expiresAt: { lt: threshold } },
      orderBy: { expiresAt: 'asc' },
      include: { user: true },
    });

    return NextResponse.json(
      grants.map(grant => ({
        id: grant.id,
        groupId: grant.groupId,
        label: PERMISSION_GROUPS[grant.groupId]?.label ?? grant.groupId,
        expiresAt: grant.expiresAt,
        status: grant.expiresAt <= now ? 'expired' : 'expiring_soon',
        user: {
          id: grant.user.id,
          loginId: grant.user.loginId,
          name: grant.user.name,
          department: grant.user.department,
          isActive: grant.user.isActive,
        },
      }))
    );
  } catch (e) {
    console.error('[admin/expirations] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}
