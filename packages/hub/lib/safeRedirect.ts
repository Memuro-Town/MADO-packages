// オープンリダイレクト対策: ログイン後のリダイレクト先を安全な同一オリジンの
// 相対パスに限定する。

/**
 * `?from=` パラメータを検証し、安全な同一オリジンの相対パスであればそのまま返す。
 * 外部ドメインへの誘導やプロトコル埋め込みなど、オープンリダイレクトにつながる
 * 入力の場合は '/' にフォールバックする。
 */
export function resolveSafeRedirect(from: string | null): string {
  const safe =
    from && from.startsWith('/') && !from.startsWith('//') &&
    !from.startsWith('/\\') && !from.includes(':')
      ? from
      : '/';
  return safe;
}
