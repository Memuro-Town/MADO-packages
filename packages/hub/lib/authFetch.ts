// クライアントコンポーネント専用の fetch ラッパー（window に依存するため、
// サーバーコンポーネントや Route Handler からは使用しないこと）。
//
// 無操作10分でセッションが切れるようになった（旧: 12時間）ことで、
// 「席を離れて戻ってきて操作した」だけで HTTP 401 が返る場面が日常的に起こる。
// 401 を画面ごとにバラバラに処理すると、利用者がセッション切れに気づけないまま
// 未取得のデータ（空欄等）を業務に使ってしまう危険がある。そのため、401検知と
// ログイン画面への誘導をこの1箇所に集約する。
import { resolveSafeRedirect } from './safeRedirect';

export type RedirectFn = (url: string) => void;

export interface AuthFetchDeps {
  /**
   * 実際にリダイレクトを行う関数。省略時は window.location.assign。
   * テストではページ遷移を起こさないよう、観測可能な関数に差し替える。
   */
  redirect?: RedirectFn;
  /**
   * リダイレクト元のパス（+クエリ文字列）を取得する関数。省略時は window.location から取得。
   */
  getCurrentPath?: () => string;
}

// 同一画面から複数のAPIを並行して叩き、複数のfetchがほぼ同時に401を返すことが
// 現実にある（例: ResidentDataExport は detail / household / columns / extras を
// 並行して呼ぶ）。そのたびにリダイレクトを実行すると多重に画面遷移が走ってしまうため、
// モジュールスコープのフラグで一度きりに制限する。
let redirecting = false;

/** テスト専用: 多重リダイレクト防止フラグをリセットする。 */
export function __resetAuthFetchGuardForTest(): void {
  redirecting = false;
}

function defaultGetCurrentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

function defaultRedirect(url: string): void {
  window.location.assign(url);
}

/**
 * proxy.ts の以下の実装と同じ形式でログイン画面のURLを組み立てる。
 *   loginUrl.searchParams.set('from', pathname + request.nextUrl.search)
 *
 * resolveSafeRedirect を通すのは、ログイン画面側（app/login/page.tsx）が
 * `from` を検証する際の前提（同一オリジンの相対パスのみ許可）と、
 * ここでの組み立て方が矛盾しないようにするため。ここで作る `from` は
 * 常に現在ページの pathname+search（= 自サイト内の相対パス）であり、
 * 外部由来の入力ではないため危険は小さいが、考え方は既存実装に揃える。
 */
export function buildLoginRedirectUrl(currentPath: string): string {
  const safeFrom = resolveSafeRedirect(currentPath);
  const params = new URLSearchParams();
  params.set('from', safeFrom);
  return `/login?${params.toString()}`;
}

/**
 * fetch のラッパー。通常時は fetch と同じように使える。
 * レスポンスが401（セッション切れ）のときはログイン画面へリダイレクトし、
 * 呼び出し元にはそのまま401のResponseを返す（呼び出し元が個別のエラー表示を
 * 重ねて行わないよう、`res.status === 401` を見て早期リターンすることを推奨）。
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  deps: AuthFetchDeps = {}
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401 && !redirecting) {
    redirecting = true;
    const getCurrentPath = deps.getCurrentPath ?? defaultGetCurrentPath;
    const redirect = deps.redirect ?? defaultRedirect;
    redirect(buildLoginRedirectUrl(getCurrentPath()));
  }

  return res;
}
