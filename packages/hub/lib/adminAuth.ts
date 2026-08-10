import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from '@/lib/session';
import { NextRequest } from 'next/server';

/**
 * admin ロールのセッションのみ通す。
 * proxy.ts で /api/admin は既にゲートされているが、各ルートでも自前で検証する
 * （多層防御。他のAPIルートも同様に自前でセッションを検証している）。
 */
export async function requireAdmin(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  return payload?.role === 'admin' ? payload : null;
}
