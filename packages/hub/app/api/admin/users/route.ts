import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { PERMISSION_GROUPS } from '@/lib/permissionGroups';
import { BCRYPT_COST, MIN_PASSWORD_LENGTH, isValidRole } from '@/lib/userAccount';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  try {
    const now = new Date();
    const users = await db.user.findMany({
      orderBy: { loginId: 'asc' },
      include: {
        permissionGrants: {
          where: { revokedAt: null, expiresAt: { gt: now } },
          orderBy: { expiresAt: 'asc' },
        },
      },
    });

    return NextResponse.json(
      users.map(user => ({
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        department: user.department,
        role: user.role,
        isActive: user.isActive,
        grants: user.permissionGrants.map(grant => ({
          groupId: grant.groupId,
          label: PERMISSION_GROUPS[grant.groupId]?.label ?? grant.groupId,
          expiresAt: grant.expiresAt,
        })),
      }))
    );
  } catch (e) {
    console.error('[admin/users] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request);
  if (!actor) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as
    { loginId?: unknown; name?: unknown; department?: unknown; role?: unknown; password?: unknown } | null;

  const loginId = typeof body?.loginId === 'string' ? body.loginId.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const department = typeof body?.department === 'string' ? body.department.trim() : '';
  const role = body?.role ?? 'staff';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!loginId || !name || !department) {
    return NextResponse.json({ error: 'ログインID・氏名・部署は必須です' }, { status: 400 });
  }
  if (!isValidRole(role)) {
    return NextResponse.json({ error: 'ロールはadminかstaffのいずれかを指定してください' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await db.user.create({
      data: { loginId, name, department, role, passwordHash },
    });

    await recordAdminAudit({
      actor,
      action: 'user.create',
      targetLogin: user.loginId,
      detail: { name: user.name, department: user.department, role: user.role },
      request,
    });

    return NextResponse.json(
      { id: user.id, loginId: user.loginId, name: user.name, department: user.department, role: user.role },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: `ログインID "${loginId}" は既に登録されています` }, { status: 409 });
    }
    console.error('[admin/users] create error:', e);
    return NextResponse.json({ error: 'ユーザー登録に失敗しました' }, { status: 500 });
  }
}
