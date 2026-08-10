'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/authFetch';

interface AuditLogEntry {
  id: number;
  at: string;
  actorLogin: string;
  actorName: string;
  actorDept: string;
  action: string;
  targetAtenaCode: number | null;
  detail: unknown;
}

interface DailyDigestEntry {
  date: string;
  digest: string;
  rowCount: number;
  computedAt: string;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP');
}

export default function ResidentAuditLogPage() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [digests, setDigests] = useState<DailyDigestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const res = await authFetch(`/api/admin/resident-log?from=${from}&to=${to}`);
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '取得に失敗しました'); return; }
      setLogs(data);
      setError(null);
    } catch {
      setError('通信エラーが発生しました');
    }
  }, [from, to]);

  const loadDigests = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/daily-digests');
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '取得に失敗しました'); return; }
      setDigests(data);
    } catch {
      setError('通信エラーが発生しました');
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadDigests(); }, [loadDigests]);

  return (
    <div className="space-y-4">
      <div className="no-print bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <label className="block text-sm">
          <span className="text-gray-600">開始日</span>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">終了日</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
        <button
          onClick={loadLogs}
          className="px-4 py-1.5 bg-mado-head text-white text-sm rounded-md hover:opacity-90 transition-opacity"
        >
          表示
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-white border border-mado-head text-mado-head text-sm rounded-md hover:bg-mado-tint transition-colors"
        >
          印刷
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <h2 className="font-bold text-mado-ink px-4 pt-4 pb-2">
          日次ダイジェスト（改ざん検知用チェーン）
        </h2>
        <p className="px-4 pb-2 text-xs text-gray-500">
          アンカー先（決裁フロー・公開リポジトリ等）へ固定する値です。「夜間バッチ実行後、最新の値をここで確認する」運用を想定しています。
        </p>
        {!digests ? (
          <p className="px-4 pb-4 text-sm text-gray-500">読み込み中…</p>
        ) : digests.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-400">
            まだ計算されていません（scripts/compute-daily-digest.mjs を実行してください）。
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">日付</th>
                <th className="px-3 py-2 font-medium">件数</th>
                <th className="px-3 py-2 font-medium">ダイジェスト（SHA-256）</th>
                <th className="px-3 py-2 font-medium">計算日時</th>
              </tr>
            </thead>
            <tbody>
              {digests.map(d => (
                <tr key={d.date} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-mado-ink whitespace-nowrap">{formatDate(d.date)}</td>
                  <td className="px-3 py-2 text-mado-ink">{d.rowCount}</td>
                  <td className="px-3 py-2 text-mado-ink font-mono break-all">{d.digest}</td>
                  <td className="px-3 py-2 text-mado-ink whitespace-nowrap">{formatDateTime(d.computedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <h2 className="font-bold text-mado-ink px-4 pt-4 pb-2">
          住民情報 閲覧・検索記録（{from} 〜 {to}）
        </h2>
        {!logs ? (
          <p className="px-4 pb-4 text-sm text-gray-500">読み込み中…</p>
        ) : logs.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-400">この期間の記録はありません。</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">日時</th>
                <th className="px-3 py-2 font-medium">操作者</th>
                <th className="px-3 py-2 font-medium">操作</th>
                <th className="px-3 py-2 font-medium">対象宛名番号</th>
                <th className="px-3 py-2 font-medium">詳細</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-gray-100 last:border-0 align-top">
                  <td className="px-3 py-2 text-mado-ink whitespace-nowrap">{formatDateTime(log.at)}</td>
                  <td className="px-3 py-2 text-mado-ink whitespace-nowrap">
                    {log.actorName}（{log.actorLogin}／{log.actorDept}）
                  </td>
                  <td className="px-3 py-2 text-mado-ink whitespace-nowrap">{log.action}</td>
                  <td className="px-3 py-2 text-mado-ink whitespace-nowrap">{log.targetAtenaCode ?? '—'}</td>
                  <td className="px-3 py-2 text-mado-ink">
                    <pre className="whitespace-pre-wrap break-all font-sans">
                      {JSON.stringify(log.detail)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
