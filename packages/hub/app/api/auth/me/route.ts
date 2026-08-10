import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const payload = token ? await verifySessionToken(token) : null;

    if (!payload) {
      return NextResponse.json({ error: '未ログインです' }, { status: 401 });
    }

    // lgn（最初のログイン時刻）はサーバー内部の絶対期限判定用のクレームであり、
    // クライアントに返す必要はない（返さない方がよい）ため除外する。
    const { sub, name, department, role } = payload;
    return NextResponse.json({ sub, name, department, role });
  } catch (e) {
    console.error('[auth/me] error:', e);
    return NextResponse.json({ error: 'エラー' }, { status: 500 });
  }
}
