import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/session';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const res = new NextResponse(null, { status: 204 });
    // maxAge: 0 で cookie を即時失効させる
    res.cookies.set(SESSION_COOKIE_NAME, '', {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return res;
  } catch (e) {
    console.error('[auth/logout] error:', e);
    return NextResponse.json({ error: 'エラー' }, { status: 500 });
  }
}
