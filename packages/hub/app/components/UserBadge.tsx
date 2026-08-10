'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

interface Me {
  sub: string;
  name: string;
  department: string;
  role: string;
}

export default function UserBadge() {
  const [me, setMe] = useState<Me | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // /api/auth/me は authFetch 経由にする。このページは proxy.ts で
        // 認証チェック済みのはずなので、ここで401が返るのは「表示直後にセッションが
        // 切れた／別タブでログアウトされた」といった実質的なセッション切れの場合のみ。
        // その場合はバッジを消すだけでなく、ログイン画面へ誘導する（他のAPI呼び出しと
        // 挙動を揃えるため）。/login は proxy.ts で認証不要ページとして扱われ
        // UserBadge 自体もそこには表示されないため、リダイレクトループにはならない。
        const res = await authFetch('/api/auth/me');
        if (!res.ok) return; // 401はauthFetch側でリダイレクト済み。それ以外は非表示のまま
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch {
        // 未ログイン等は無視して非表示のまま
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  };

  if (!me) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">
        {me.name}（{me.department}）
      </span>
      {me.role === 'admin' && (
        <Link
          href="/admin"
          className="px-3 py-1 bg-white border border-gray-300 rounded-md text-mado-head text-xs hover:bg-gray-50 transition-colors"
        >
          管理画面
        </Link>
      )}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="px-3 py-1 bg-white border border-gray-300 rounded-md text-gray-700 text-xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {loggingOut ? '処理中…' : 'ログアウト'}
      </button>
    </div>
  );
}
