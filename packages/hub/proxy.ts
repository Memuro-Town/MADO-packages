// 認証ゲート（Next.js 16 では middleware.ts が非推奨となり proxy.ts に改名された）
// jose のみに依存する lib/session.ts だけを import すること（Prisma / bcryptjs は不可）。
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_IDLE_MAX_AGE_SEC,
  renewSessionToken,
  verifySessionToken,
} from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

// 認証不要の公開パス
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

// admin ロールのみアクセスできるパス（管理画面本体＋そのAPI）
const ADMIN_ONLY_PATHS = ['/admin', '/api/admin'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    p => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PATHS.some(
    p => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (payload) {
    // 認証済みリクエストのたびに毎回トークンを再発行し、無操作期限（10分）を延長する。
    // 「前回発行から一定時間経過したときだけ延長する」といった間引きはしない。
    // 間引くと実効的な無操作期限が10分より短くなるケースが生じ、
    // 「最終操作から10分」という仕様を満たさなくなるため。
    // 絶対期限（12時間）は renewSessionToken が lgn を引き継ぐことで担保される
    // （lgn は書き換わらないので、verifySessionToken 側の絶対期限判定がそのまま効く）。
    const renewedToken = await renewSessionToken(payload);
    const applyRenewedCookie = (res: NextResponse) => {
      res.cookies.set(SESSION_COOKIE_NAME, renewedToken, {
        ...SESSION_COOKIE_OPTIONS,
        maxAge: SESSION_IDLE_MAX_AGE_SEC,
      });
      return res;
    };

    // /admin・/api/admin は admin ロールのみ。role はJWTに含まれているため
    // ここで判定できる（DBを見に行く必要はない）。
    if (isAdminOnlyPath(pathname) && payload.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return applyRenewedCookie(
          NextResponse.json({ error: '権限がありません' }, { status: 403 })
        );
      }
      return applyRenewedCookie(NextResponse.redirect(new URL('/', request.url)));
    }

    return applyRenewedCookie(NextResponse.next());
  }

  // APIは401 JSON、画面は /login へリダイレクト（元URLを ?from= に付与）
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // _next配下・faviconなどの静的アセットは対象外
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
