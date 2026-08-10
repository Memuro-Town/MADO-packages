import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { PERMISSION_GROUPS, expandGroupColumns } from '@/lib/permissionGroups';
import { isValidRole } from '@/lib/userAccount';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'ユーザーIDが不正です' }, { status: 400 });
  }

  try {
    const now = new Date();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: '該当ユーザーが見つかりません' }, { status: 404 });
    }

    const [grants, exceptions] = await Promise.all([
      db.permissionGrant.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'asc' },
      }),
      db.permissionException.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        department: user.department,
        role: user.role,
        isActive: user.isActive,
      },
      // グループ標準の項目（除外の打ち消し線表示は画面側でexceptionsと突き合わせて行う）
      grants: grants.map(grant => ({
        id: grant.id,
        groupId: grant.groupId,
        label: PERMISSION_GROUPS[grant.groupId]?.label ?? grant.groupId,
        expiresAt: grant.expiresAt,
        grantedAt: grant.grantedAt,
        grantedBy: grant.grantedBy,
        reason: grant.reason,
        columns: [...expandGroupColumns(grant.groupId)],
      })),
      exceptions: {
        add: exceptions
          .filter(e => e.effect === 'add')
          .map(e => ({
            id: e.id,
            columnName: e.columnName,
            expiresAt: e.expiresAt,
            grantedAt: e.grantedAt,
            grantedBy: e.grantedBy,
            reason: e.reason,
          })),
        remove: exceptions
          .filter(e => e.effect === 'remove')
          .map(e => ({
            id: e.id,
            columnName: e.columnName,
            expiresAt: e.expiresAt,
            grantedAt: e.grantedAt,
            grantedBy: e.grantedBy,
            reason: e.reason,
          })),
      },
    });
  } catch (e) {
    console.error('[admin/users/[id]] DB error:', e);
    return NextResponse.json({ error: 'データベースエラー' }, { status: 500 });
  }
}

// name・department・role・isActive の更新（ログインID・パスワードはここでは扱わない）
export async function PATCH(
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
    { name?: unknown; department?: unknown; role?: unknown; isActive?: unknown } | null;

  const data: Prisma.UserUpdateInput = {};
  if (body?.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: '氏名が不正です' }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body?.department !== undefined) {
    if (typeof body.department !== 'string' || !body.department.trim()) {
      return NextResponse.json({ error: '部署が不正です' }, { status: 400 });
    }
    data.department = body.department.trim();
  }
  if (body?.role !== undefined) {
    if (!isValidRole(body.role)) {
      return NextResponse.json({ error: 'ロールはadminかstaffのいずれかを指定してください' }, { status: 400 });
    }
    data.role = body.role;
  }
  if (body?.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActiveが不正です' }, { status: 400 });
    }
    data.isActive = body.isActive;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 });
  }

  try {
    const before = await db.user.findUnique({ where: { id: userId } });
    if (!before) {
      return NextResponse.json({ error: '該当ユーザーが見つかりません' }, { status: 404 });
    }

    const after = await db.user.update({ where: { id: userId }, data });

    await recordAdminAudit({
      actor,
      action: 'user.update',
      targetLogin: after.loginId,
      detail: {
        before: { name: before.name, department: before.department, role: before.role, isActive: before.isActive },
        after: { name: after.name, department: after.department, role: after.role, isActive: after.isActive },
      },
      request,
    });

    return NextResponse.json({
      id: after.id,
      loginId: after.loginId,
      name: after.name,
      department: after.department,
      role: after.role,
      isActive: after.isActive,
    });
  } catch (e) {
    console.error('[admin/users/[id]] update error:', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
