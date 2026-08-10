import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authFetch, buildLoginRedirectUrl, __resetAuthFetchGuardForTest } from '@/lib/authFetch';

function makeResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildLoginRedirectUrl', () => {
  it('現在のパスを from に付けたログインURLを組み立てる', () => {
    expect(buildLoginRedirectUrl('/residents/123')).toBe('/login?from=%2Fresidents%2F123');
  });

  it('クエリ文字列付きのパスもそのまま from に含める', () => {
    const url = buildLoginRedirectUrl('/residents/123?tab=export');
    const parsed = new URL(url, 'http://localhost');
    expect(parsed.searchParams.get('from')).toBe('/residents/123?tab=export');
  });

  it('外部URL等の危険な from は resolveSafeRedirect により / にフォールバックする', () => {
    const url = buildLoginRedirectUrl('//evil.com');
    const parsed = new URL(url, 'http://localhost');
    expect(parsed.searchParams.get('from')).toBe('/');
  });
});

describe('authFetch', () => {
  beforeEach(() => {
    __resetAuthFetchGuardForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200のときはリダイレクトせずレスポンスをそのまま返す', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const redirect = vi.fn();

    const res = await authFetch('/api/residents/search?q=foo', undefined, {
      redirect,
      getCurrentPath: () => '/residents/search',
    });

    expect(res.status).toBe(200);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('401のときはログイン画面へのリダイレクトが1回発生する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, { error: '認証が必要です' }));
    vi.stubGlobal('fetch', fetchMock);
    const redirect = vi.fn();

    const res = await authFetch('/api/residents/columns', undefined, {
      redirect,
      getCurrentPath: () => '/residents/123',
    });

    expect(res.status).toBe(401);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/login?from=%2Fresidents%2F123');
  });

  it('from パラメータに元のパス（+クエリ）が正しく入る', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    const redirect = vi.fn();

    await authFetch('/api/residents/999/extras?cols=備考', undefined, {
      redirect,
      getCurrentPath: () => '/residents/999?tab=export',
    });

    const calledWith = redirect.mock.calls[0][0] as string;
    const parsed = new URL(calledWith, 'http://localhost');
    expect(parsed.pathname).toBe('/login');
    expect(parsed.searchParams.get('from')).toBe('/residents/999?tab=export');
  });

  it('並行して複数の401が返っても、リダイレクトは1回だけ実行される', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    const redirect = vi.fn();
    const deps = { redirect, getCurrentPath: () => '/residents/123' };

    // ResidentDataExport のように、同一画面から複数のAPIをほぼ同時に叩く状況を再現する。
    await Promise.all([
      authFetch('/api/residents/123', undefined, deps),
      authFetch('/api/households/456', undefined, deps),
      authFetch('/api/residents/columns', undefined, deps),
    ]);

    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('404など401以外のエラーではリダイレクトしない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(500, { error: 'サーバーエラー' }));
    vi.stubGlobal('fetch', fetchMock);
    const redirect = vi.fn();

    const res = await authFetch('/api/residents/columns', undefined, { redirect });

    expect(res.status).toBe(500);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('デフォルトの getCurrentPath / redirect を使わなければ window に依存せず動作する', async () => {
    // deps を渡さない呼び出し方でも、401以外なら window を一切参照しない。
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authFetch('/api/residents/columns');
    expect(res.status).toBe(200);
  });
});
