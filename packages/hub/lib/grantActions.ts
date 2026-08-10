import { db } from '@/lib/db';
import { recordAdminAudit } from '@/lib/adminAudit';
import { nextFiscalYearEnd } from '@/lib/fiscalYear';
import type { SessionPayload } from '@/lib/session';
import { NextRequest } from 'next/server';
import type { PermissionGrant, User } from '@prisma/client';

/**
 * 権限グループ付与の延長。個人の権限詳細画面（1件ずつ）と
 * 期限運用画面の一括継続（複数件）の両方から呼ぶ共通ロジック。
 * 呼び出し元は grant の存在確認（および必要ならuserIdの一致確認）を先に行うこと。
 */
export async function extendGrant(
  grant: PermissionGrant & { user: User },
  actor: SessionPayload,
  request: NextRequest,
  expiresAt: Date = nextFiscalYearEnd()
): Promise<PermissionGrant> {
  const updated = await db.permissionGrant.update({
    where: { id: grant.id },
    data: { expiresAt, grantedBy: actor.sub },
  });

  await recordAdminAudit({
    actor,
    action: 'grant.extend',
    targetLogin: grant.user.loginId,
    detail: { groupId: grant.groupId, expiresAt: updated.expiresAt },
    request,
  });

  return updated;
}
