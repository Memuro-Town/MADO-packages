import { db } from '@/lib/db';
import type { SessionPayload } from '@/lib/session';
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';

/**
 * リクエストからベストエフォートでクライアントIPを取り出す。
 * NextRequest には ip プロパティが無いため、リバースプロキシが付与する
 * ヘッダーを見る。無ければ null（schema上 ip は任意項目）。
 */
function extractIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

interface RecordAdminAuditParams {
  actor: SessionPayload;
  action: string;
  targetLogin?: string;
  detail: Prisma.InputJsonValue;
  request: NextRequest;
}

/**
 * 管理画面の書き込み操作をすべて記録する。
 * actorName・actorDept はJWT（操作時点の情報）から焼き込む。異動があっても
 * 「当時どの部署の誰が操作したか」が残るようにするため（第1回§6の設計）。
 */
export async function recordAdminAudit({
  actor,
  action,
  targetLogin,
  detail,
  request,
}: RecordAdminAuditParams): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      actorLogin: actor.sub,
      actorName: actor.name,
      actorDept: actor.department,
      action,
      targetLogin,
      detail,
      ip: extractIp(request),
      userAgent: request.headers.get('user-agent'),
    },
  });
}
