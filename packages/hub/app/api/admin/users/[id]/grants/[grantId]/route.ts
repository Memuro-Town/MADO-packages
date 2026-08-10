import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { PERMISSION_GROUPS } from '@/lib/permissionGroups';
import { extendGrant } from '@/lib/grantActions';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  const actor = await requireAdmin(request);
  if (!actor) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const { id, grantId: grantIdStr } = await params;
  const userId = parseInt(id, 10);
  const grantId = parseInt(grantIdStr, 10);
  if (isNaN(userId) || isNaN(grantId)) {
    return NextResponse.json({ error: 'IDが不正です' }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as
    { action?: unknown; expiresAt?: unknown } | null;
  const action = body?.action;
  if (action !== 'revoke' && action !== 'extend') {
    return NextResponse.json({ error: 'actionはrevokeかextendを指定してください' }, { status: 400 });
  }

  try {
    const grant = await db.permissionGrant.findUnique({
      where: { id: grantId },
      include: { user: true },
    });
    if (!grant || grant.userId !== userId) {
      return NextResponse.json({ error: '該当する付与が見つかりません' }, { status: 404 });
    }

    if (action === 'revoke') {
      const updated = await db.permissionGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date() },
      });
      await recordAdminAudit({
        actor,
        action: 'grant.revoke',
        targetLogin: grant.user.loginId,
        detail: { groupId: grant.groupId },
        request,
      });
      return NextResponse.json({ id: updated.id, revokedAt: updated.revokedAt });
    }

    let expiresAt: Date | undefined;
    if (typeof body?.expiresAt === 'string') {
      expiresAt = new Date(body.expiresAt);
      if (isNaN(expiresAt.getTime())) {
        return NextResponse.json({ error: '期限の形式が不正です' }, { status: 400 });
      }
    }
    const updated = expiresAt
      ? await extendGrant(grant, actor, request, expiresAt)
      : await extendGrant(grant, actor, request);
    return NextResponse.json({
      id: updated.id,
      groupId: updated.groupId,
      label: PERMISSION_GROUPS[updated.groupId]?.label ?? updated.groupId,
      expiresAt: updated.expiresAt,
    });
  } catch (e) {
    console.error('[admin/users/[id]/grants/[grantId]] error:', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
