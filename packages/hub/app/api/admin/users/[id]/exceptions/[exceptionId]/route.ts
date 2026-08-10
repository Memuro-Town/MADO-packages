import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; exceptionId: string }> }
) {
  const actor = await requireAdmin(request);
  if (!actor) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const { id, exceptionId: exceptionIdStr } = await params;
  const userId = parseInt(id, 10);
  const exceptionId = parseInt(exceptionIdStr, 10);
  if (isNaN(userId) || isNaN(exceptionId)) {
    return NextResponse.json({ error: 'IDが不正です' }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== 'revoke') {
    return NextResponse.json({ error: 'actionはrevokeを指定してください' }, { status: 400 });
  }

  try {
    const exception = await db.permissionException.findUnique({
      where: { id: exceptionId },
      include: { user: true },
    });
    if (!exception || exception.userId !== userId) {
      return NextResponse.json({ error: '該当する例外が見つかりません' }, { status: 404 });
    }

    const updated = await db.permissionException.update({
      where: { id: exceptionId },
      data: { revokedAt: new Date() },
    });

    await recordAdminAudit({
      actor,
      action: 'exception.revoke',
      targetLogin: exception.user.loginId,
      detail: { effect: exception.effect, columnName: exception.columnName },
      request,
    });

    return NextResponse.json({ id: updated.id, revokedAt: updated.revokedAt });
  } catch (e) {
    console.error('[admin/users/[id]/exceptions/[exceptionId]] error:', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
