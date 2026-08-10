import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';
import { nextFiscalYearEnd } from '@/lib/fiscalYear';
import { cols } from '@/lib/columns';
import { NextRequest, NextResponse } from 'next/server';

// 現状は住民テーブルのみを対象とする（Phase 1の合意事項：初期実装は住民テーブルのみ）
const TABLE_NAME = cols.table;

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
    { effect?: unknown; columnName?: unknown; expiresAt?: unknown; reason?: unknown } | null;

  const effect = body?.effect;
  if (effect !== 'add' && effect !== 'remove') {
    return NextResponse.json({ error: 'effectはaddかremoveを指定してください' }, { status: 400 });
  }
  const columnName = typeof body?.columnName === 'string' ? body.columnName.trim() : '';
  if (!columnName) {
    return NextResponse.json({ error: '列名は必須です' }, { status: 400 });
  }
  // reasonは必須（申請の根拠。スキーマ上もNOT NULL）
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: '理由の入力は必須です' }, { status: 400 });
  }
  const expiresAt = typeof body?.expiresAt === 'string' ? new Date(body.expiresAt) : nextFiscalYearEnd();
  if (isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: '期限の形式が不正です' }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: '該当ユーザーが見つかりません' }, { status: 404 });
    }

    // 列名の存在確認（typoで意味のない例外行が作られるのを防ぐ）
    const schema = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = current_schema()`,
      TABLE_NAME
    );
    if (!schema.some(r => r.name === columnName)) {
      return NextResponse.json({ error: `列 "${columnName}" は存在しません` }, { status: 400 });
    }

    const exception = await db.permissionException.create({
      data: {
        userId,
        effect,
        tableName: TABLE_NAME,
        columnName,
        expiresAt,
        grantedBy: actor.sub,
        reason,
      },
    });

    await recordAdminAudit({
      actor,
      action: 'exception.add',
      targetLogin: user.loginId,
      detail: { effect, columnName, expiresAt, reason },
      request,
    });

    return NextResponse.json(
      {
        id: exception.id,
        effect: exception.effect,
        columnName: exception.columnName,
        expiresAt: exception.expiresAt,
        reason: exception.reason,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error('[admin/users/[id]/exceptions] error:', e);
    return NextResponse.json({ error: '例外の追加に失敗しました' }, { status: 500 });
  }
}
