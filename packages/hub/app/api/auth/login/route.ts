import { db } from '@/lib/db';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_IDLE_MAX_AGE_SEC,
} from '@/lib/session';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

// 認証失敗時の遅延（総当たり対策）
const FAILURE_DELAY_MS = 500;

// ユーザーが存在しない場合にも bcrypt.compare を実行するためのダミーハッシュ。
// 応答時間の差から loginId の存在有無を推測されないようにする。
const DUMMY_HASH = '$2b$10$lPnVQmpNJCEAfidNLJxNe.MawxudPk2p6RQMuFvwOD5g7uBLqrsm2';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginFailure() {
  await delay(FAILURE_DELAY_MS);
  return NextResponse.json(
    { error: 'ログインIDまたはパスワードが違います' },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as
      { loginId?: unknown; password?: unknown } | null;
    const loginId = typeof body?.loginId === 'string' ? body.loginId.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!loginId || !password) {
      return loginFailure();
    }

    const user = await db.user.findFirst({
      where: { loginId, isActive: true },
    });

    // ユーザー不在でもダミーハッシュと比較し、IDの存在有無で応答を変えない
    const matched = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !matched) {
      return loginFailure();
    }

    const token = await createSessionToken({
      sub: user.loginId,
      name: user.name,
      department: user.department,
      role: user.role,
    });

    const res = NextResponse.json({
      name: user.name,
      department: user.department,
      role: user.role,
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      ...SESSION_COOKIE_OPTIONS,
      // Cookie の maxAge は無操作期限（10分）。以降は proxy.ts が
      // リクエストのたびにトークンを再発行してこの分だけ延長する。
      // 絶対期限（12時間）は lgn クレームにより別途担保される。
      maxAge: SESSION_IDLE_MAX_AGE_SEC,
    });
    return res;
  } catch (e) {
    console.error('[auth/login] error:', e);
    return NextResponse.json({ error: 'エラー' }, { status: 500 });
  }
}
