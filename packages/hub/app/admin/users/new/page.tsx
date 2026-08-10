'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

export default function NewUserPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError('パスワードが一致しません');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, name, department, role, password }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '登録に失敗しました'); return; }
      router.push(`/admin/users/${data.id}`);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="text-sm text-mado-head hover:underline">
        ← ユーザー一覧へ戻る
      </Link>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3 max-w-md">
        <h2 className="font-bold text-mado-ink border-l-4 border-mado-head pl-2 mb-2">新規ユーザー登録</h2>

        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
        )}

        <label className="block text-sm">
          <span className="text-gray-600">ログインID</span>
          <input
            type="text"
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">氏名</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">部署</span>
          <input
            type="text"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">ロール</span>
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'staff' | 'admin')}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          >
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">パスワード（8文字以上）</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">パスワード（確認）</span>
          <input
            type="password"
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? '登録中…' : '登録'}
        </button>
      </form>
    </div>
  );
}
