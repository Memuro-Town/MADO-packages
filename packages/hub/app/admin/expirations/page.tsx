'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

interface ExpiringGrant {
  id: number;
  groupId: string;
  label: string;
  expiresAt: string;
  status: 'expired' | 'expiring_soon';
  user: {
    id: number;
    loginId: string;
    name: string;
    department: string;
    isActive: boolean;
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP');
}

export default function ExpirationsPage() {
  const [grants, setGrants] = useState<ExpiringGrant[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/expirations');
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '取得に失敗しました'); return; }
      setGrants(data);
      setSelected(new Set());
      setError(null);
    } catch {
      setError('通信エラーが発生しました');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!grants) return;
    setSelected(prev => (prev.size === grants.length ? new Set() : new Set(grants.map(g => g.id))));
  };

  const handleBulkExtend = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/admin/expirations/bulk-extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantIds: [...selected] }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '一括継続に失敗しました'); return; }
      setMessage(`${data.extendedCount}件を翌年度末まで延長しました。`);
      await load();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>;
  }

  if (!grants) {
    return <p className="text-gray-500 text-sm">読み込み中…</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="font-bold text-mado-ink border-l-4 border-mado-head pl-2">
          期限切れ間近・期限切れ済みの権限
        </h2>
        <button
          onClick={handleBulkExtend}
          disabled={selected.size === 0 || submitting}
          className="px-3 py-1.5 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? '処理中…' : `選択した${selected.size}件を一括継続（翌年度末まで）`}
        </button>
      </div>
      {message && <p className="px-4 pb-2 text-sm text-mado-head">{message}</p>}

      {grants.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-400">期限切れ間近・期限切れ済みの権限はありません。</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="px-4 py-2">
                <input type="checkbox" checked={selected.size === grants.length} onChange={toggleAll} />
              </th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium">ログインID</th>
              <th className="px-4 py-2 font-medium">氏名</th>
              <th className="px-4 py-2 font-medium">部署</th>
              <th className="px-4 py-2 font-medium">グループ</th>
              <th className="px-4 py-2 font-medium">期限</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {grants.map(grant => (
              <tr key={grant.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(grant.id)}
                    onChange={() => toggle(grant.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  {grant.status === 'expired' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-600 text-white">期限切れ</span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-mado-tint text-mado-head">間近</span>
                  )}
                </td>
                <td className="px-4 py-3 text-mado-ink">{grant.user.loginId}</td>
                <td className="px-4 py-3 text-mado-ink">{grant.user.name}</td>
                <td className="px-4 py-3 text-mado-ink">{grant.user.department}</td>
                <td className="px-4 py-3 text-mado-ink">{grant.label}</td>
                <td className="px-4 py-3 text-mado-ink">{formatDate(grant.expiresAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/users/${grant.user.id}`} className="text-mado-head text-sm hover:underline">
                    詳細 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
