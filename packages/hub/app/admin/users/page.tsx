'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

interface GrantSummary {
  groupId: string;
  label: string;
  expiresAt: string;
}

interface UserRow {
  id: number;
  loginId: string;
  name: string;
  department: string;
  role: string;
  isActive: boolean;
  grants: GrantSummary[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP');
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch('/api/admin/users');
        if (res.status === 401) return; // ログイン画面へリダイレクト済み
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? '取得に失敗しました'); return; }
        if (!cancelled) setUsers(data);
      } catch {
        setError('通信エラーが発生しました');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>;
  }

  if (!users) {
    return <p className="text-gray-500 text-sm">読み込み中…</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="font-bold text-mado-ink border-l-4 border-mado-head ml-4 pl-2">
          ユーザー一覧
        </h2>
        <Link
          href="/admin/users/new"
          className="px-3 py-1.5 bg-mado-head text-white text-sm rounded-md hover:opacity-90 transition-opacity"
        >
          新規登録
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="px-4 py-2 font-medium">ログインID</th>
            <th className="px-4 py-2 font-medium">氏名</th>
            <th className="px-4 py-2 font-medium">部署</th>
            <th className="px-4 py-2 font-medium">ロール</th>
            <th className="px-4 py-2 font-medium">状態</th>
            <th className="px-4 py-2 font-medium">付与グループ・期限</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 text-mado-ink">{user.loginId}</td>
              <td className="px-4 py-3 text-mado-ink">{user.name}</td>
              <td className="px-4 py-3 text-mado-ink">{user.department}</td>
              <td className="px-4 py-3 text-mado-ink">{user.role}</td>
              <td className="px-4 py-3">
                {user.isActive ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-mado-tint text-mado-head">有効</span>
                ) : (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-600 text-white">無効</span>
                )}
              </td>
              <td className="px-4 py-3 text-mado-ink">
                {user.grants.length === 0 ? (
                  <span className="text-gray-400">なし</span>
                ) : (
                  <ul className="space-y-0.5">
                    {user.grants.map(grant => (
                      <li key={grant.groupId}>
                        {grant.label}
                        <span className="text-gray-400">（〜{formatDate(grant.expiresAt)}）</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/users/${user.id}`} className="text-mado-head text-sm hover:underline">
                  詳細 →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
