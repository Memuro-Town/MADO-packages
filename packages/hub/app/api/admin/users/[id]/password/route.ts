import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { BCRYPT_COST, MIN_PASSWORD_LENGTH } from '@/lib/userAccount';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

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

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
      { status: 400 }
    );
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: '該当ユーザーが見つかりません' }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await db.user.update({ where: { id: userId }, data: { passwordHash } });

    // パスワードそのものはログに残さない
    await recordAdminAudit({
      actor,
      action: 'user.password_reset',
      targetLogin: user.loginId,
      detail: {},
      request,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/users/[id]/password] error:', e);
    return NextResponse.json({ error: 'パスワードリセットに失敗しました' }, { status: 500 });
  }
}
