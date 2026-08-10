import { db } from '@/lib/db';
import type { SessionPayload } from '@/lib/session';
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';

/**
 * リクエストからベストエフォートでクライアントIPを取り出す。
 * lib/adminAudit.ts と同じロジック。
 */
function extractIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

interface RecordAuditLogParams {
  actor: SessionPayload;
  action: string;
  targetAtenaCode?: number;
  detail: Prisma.InputJsonValue;
  request: NextRequest;
}

/**
 * 住民情報の閲覧・検索を記録する（管理画面の操作記録＝AdminAuditLogとは別）。
 * actorName・actorDept はJWT（操作時点の情報）から焼き込む。異動があっても
 * 「当時どの部署の誰が見たか」が残るようにするため。
 *
 * ⚠️ このテーブルの行はハッシュチェーン（lib/auditDigest.ts）の入力になる。
 * 呼び出し側で何を detail に入れるかは自由だが、一度書き込んだ行を後から
 * 更新・削除する運用は想定していない（改ざん検知の前提が崩れるため）。
 */
export async function recordAuditLog({
  actor,
  action,
  targetAtenaCode,
  detail,
  request,
}: RecordAuditLogParams): Promise<void> {
  await db.auditLog.create({
    data: {
      actorLogin: actor.sub,
      actorName: actor.name,
      actorDept: actor.department,
      action,
      targetAtenaCode,
      detail,
      ip: extractIp(request),
      userAgent: request.headers.get('user-agent'),
    },
  });
}
