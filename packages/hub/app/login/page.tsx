'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveSafeRedirect } from '@/lib/safeRedirect';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'ログインに失敗しました');
        setLoading(false);
        return;
      }

      // オープンリダイレクト対策: 同一オリジンの相対パスのみ許可
      const from = searchParams.get('from');
      const safe = resolveSafeRedirect(from);
      window.location.assign(safe);
    } catch {
      setError('通信エラーが発生しました');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-mado-soft flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-mado-head flex items-center justify-center gap-2">
            <img src="/mado_wordmark.png" alt="MADO" width={32} height={32} className="inline-block" />
            hub
          </h1>
          <p className="text-gray-500 text-sm mt-1">ログインしてください</p>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="loginId" className="block text-xs font-bold text-gray-600 mb-1">
              ログインID
            </label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-gray-600 mb-1">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </main>
  );
}
