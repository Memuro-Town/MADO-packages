// セッション基盤（JWT: HS256）
// 注意: proxy.ts（旧middleware）から import されるため、このファイルは jose 以外に依存しないこと。
//       bcryptjs や Prisma をここに import してはならない。
import { SignJWT, jwtVerify } from 'jose';

/** セッションcookie名 */
export const SESSION_COOKIE_NAME = 'mado_session';

/**
 * 無操作期限（秒）: 10分。
 * 操作（リクエスト）があるたびに proxy.ts がトークンを再発行し、この分だけ延長する。
 */
export const SESSION_IDLE_MAX_AGE_SEC = 10 * 60;

/**
 * 絶対期限（秒）: 12時間。
 * 最初のログイン（lgnクレーム）からこの秒数を過ぎたら、操作を続けていても必ず失効させる。
 */
export const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

/**
 * セッションcookieの共通属性。
 * 閉域LAN内のhttp配信のため secure は付けない。
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** JWTペイロード（sub には loginId を格納する） */
export interface SessionPayload {
  sub: string;
  name: string;
  department: string;
  role: string; // "admin" | "staff"
  /**
   * 最初のログイン時刻（エポック秒）。絶対期限（12時間）の起点となるクレーム。
   * - createSessionToken への入力では無視され、常に現在時刻で上書きされる
   *   （新規ログインなので指定しなくてよい。省略可）。
   * - verifySessionToken の戻り値には常に含まれる。
   * - renewSessionToken はこの値をそのまま引き継ぎ、書き換えない。
   */
  lgn?: number;
}

/**
 * SESSION_SECRET を取得する。
 * 未設定・32文字未満の場合は最初のセッション処理時に明示的なエラーで停止し、
 * 設定漏れにすぐ気づけるようにする。
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET 環境変数が未設定か短すぎます。32文字以上のランダムな文字列を .env に設定してください。'
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * 指定した lgn（最初のログイン時刻）を使ってJWTに署名する内部ヘルパー。
 * exp は常に「今 + 無操作期限（10分）」にする。絶対期限（12時間）は
 * verifySessionToken 側で lgn との差分から判定する。
 */
async function signToken(payload: SessionPayload, lgn: number): Promise<string> {
  const { sub, name, department, role } = payload;
  return await new SignJWT({ name, department, role, lgn })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_IDLE_MAX_AGE_SEC}s`)
    .sign(getSecretKey());
}

/**
 * 新規ログイン用にセッションJWTを作成する。
 * payload.lgn が指定されていても無視し、常に現在時刻を lgn としてセットする
 * （新規ログインは常にそのときが「最初のログイン時刻」になるため）。
 * 無操作期限（10分）で失効するトークンを発行する。
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return await signToken(payload, nowSec);
}

/**
 * 延長用にセッションJWTを再発行する。
 * payload.lgn（最初のログイン時刻。verifySessionToken の戻り値から得る）を
 * 引き継いだまま、exp のみ「今 + 無操作期限」に更新する。
 * lgn を引き継ぐことで、延長を繰り返しても絶対期限（12時間）は動かない。
 */
export async function renewSessionToken(payload: SessionPayload): Promise<string> {
  if (typeof payload.lgn !== 'number') {
    // verifySessionToken の戻り値以外（lgn を持たない payload）を渡す誤用を防ぐ。
    throw new Error('renewSessionToken には lgn を含む payload（verifySessionToken の戻り値）を渡してください。');
  }
  return await signToken(payload, payload.lgn);
}

/**
 * セッションJWTを検証する。
 * 有効ならペイロードを返し、無効・期限切れ・不正な場合は null を返す。
 *
 * - jose が exp（無操作期限）を検証するため、無操作10分超過は自動的に弾かれる。
 * - lgn（最初のログイン時刻）から SESSION_MAX_AGE_SEC（12時間）を超えている場合は
 *   絶対期限切れとして null を返す。
 * - lgn クレームを持たないトークン（このスライディング延長方式の導入前に発行された
 *   旧形式のトークン）は意図的に無効とする。導入時に全職員が1回だけ再ログインを
 *   求められる形になるが、閉域網内の庁内ツールであるため許容する運用判断。
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.department !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.lgn !== 'number'
    ) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - payload.lgn > SESSION_MAX_AGE_SEC) {
      return null;
    }

    return {
      sub: payload.sub,
      name: payload.name,
      department: payload.department,
      role: payload.role,
      lgn: payload.lgn,
    };
  } catch {
    return null;
  }
}
