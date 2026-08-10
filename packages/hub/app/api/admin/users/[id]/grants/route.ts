import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { PERMISSION_GROUPS } from '@/lib/permissionGroups';
import { nextFiscalYearEnd } from '@/lib/fiscalYear';
import { NextRequest, NextResponse } from 'next/server';

// グループ付与（「グループボタン」相当）。
// 既に有効な同グループのgrantがある場合は新規作成せず、延長として扱う
// （画面側は通常「延長」操作をPATCHで呼ぶが、二重クリック等の保険としてここでも吸収する）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireAdmin(request);
  if (!actor) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'ユーザーIDが不正です' }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as
    { groupId?: unknown; expiresAt?: unknown; reason?: unknown } | null;
  const groupId = typeof body?.groupId === 'string' ? body.groupId : '';
  if (!PERMISSION_GROUPS[groupId]) {
    return NextResponse.json({ error: '存在しない権限グループです' }, { status: 400 });
  }
  const expiresAt = typeof body?.expiresAt === 'string' ? new Date(body.expiresAt) : nextFiscalYearEnd();
  if (isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: '期限の形式が不正です' }, { status: 400 });
  }
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: '該当ユーザーが見つかりません' }, { status: 404 });
    }

    const now = new Date();
    const existing = await db.permissionGrant.findFirst({
      where: { userId, groupId, revokedAt: null, expiresAt: { gt: now } },
    });

    const grant = existing
      ? await db.permissionGrant.update({
          where: { id: existing.id },
          data: { expiresAt, grantedBy: actor.sub, reason },
        })
      : await db.permissionGrant.create({
          data: { userId, groupId, expiresAt, grantedBy: actor.sub, reason },
        });

    await recordAdminAudit({
      actor,
      action: existing ? 'grant.extend' : 'grant.add',
      targetLogin: user.loginId,
      detail: { groupId, expiresAt: grant.expiresAt, reason },
      request,
    });

    return NextResponse.json(
      {
        id: grant.id,
        groupId: grant.groupId,
        label: PERMISSION_GROUPS[grant.groupId]?.label ?? grant.groupId,
        expiresAt: grant.expiresAt,
      },
      { status: existing ? 200 : 201 }
    );
  } catch (e) {
    console.error('[admin/users/[id]/grants] error:', e);
    return NextResponse.json({ error: 'グループの付与に失敗しました' }, { status: 500 });
  }
}
