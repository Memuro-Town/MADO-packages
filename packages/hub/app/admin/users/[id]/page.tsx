'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';
import { PERMISSION_GROUPS } from '@/lib/permissionGroups';

interface Grant {
  id: number;
  groupId: string;
  label: string;
  expiresAt: string;
  grantedAt: string;
  grantedBy: string;
  reason: string | null;
  columns: string[];
}

interface ExceptionItem {
  id: number;
  columnName: string;
  expiresAt: string;
  grantedAt: string;
  grantedBy: string;
  reason: string;
}

interface UserDetail {
  user: {
    id: number;
    loginId: string;
    name: string;
    department: string;
    role: string;
    isActive: boolean;
  };
  grants: Grant[];
  exceptions: {
    add: ExceptionItem[];
    remove: ExceptionItem[];
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP');
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/admin/users/${params.id}`);
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '取得に失敗しました'); return; }
      setDetail(data);
      setError(null);
    } catch {
      setError('通信エラーが発生しました');
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !detail) {
    return <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>;
  }

  if (!detail) {
    return <p className="text-gray-500 text-sm">読み込み中…</p>;
  }

  const { user, grants, exceptions } = detail;
  const removedColumns = new Set(exceptions.remove.map(e => e.columnName));
  const grantedGroupIds = new Set(grants.map(g => g.groupId));
  const ungrantedGroups = Object.values(PERMISSION_GROUPS).filter(g => !grantedGroupIds.has(g.id));

  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="text-sm text-mado-head hover:underline">
        ← ユーザー一覧へ戻る
      </Link>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg text-mado-ink">{user.name}</h2>
          <span className="text-gray-500 text-sm">{user.loginId}（{user.department}／{user.role}）</span>
          {user.isActive ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-mado-tint text-mado-head">有効</span>
          ) : (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-600 text-white">無効</span>
          )}
        </div>
      </div>

      <EditUserForm user={user} onUpdated={load} onError={setError} />
      <PasswordResetForm userId={user.id} onError={setError} />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="font-bold text-mado-ink mb-3">付与グループ</h3>
        {grants.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">付与されているグループがありません。</p>
        ) : (
          <div className="space-y-4 mb-3">
            {grants.map(grant => (
              <div key={grant.id}>
                <div className="text-sm mb-1 flex items-center gap-2">
                  <span className="font-medium text-mado-ink">{grant.label}</span>
                  <span className="text-gray-400">
                    〜{formatDate(grant.expiresAt)}（付与: {grant.grantedBy}）
                  </span>
                  <GrantActions userId={user.id} grant={grant} onChanged={load} onError={setError} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {grant.columns.map(column => {
                    const isRemoved = removedColumns.has(column);
                    return (
                      <span
                        key={column}
                        className={
                          isRemoved
                            ? 'text-xs px-2 py-0.5 rounded border border-gray-200 text-mado-ink/40 line-through'
                            : 'text-xs px-2 py-0.5 rounded bg-mado-soft border border-gray-200 text-mado-ink'
                        }
                      >
                        {column}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {ungrantedGroups.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {ungrantedGroups.map(group => (
              <GrantButton key={group.id} userId={user.id} group={group} onChanged={load} onError={setError} />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="font-bold text-mado-ink mb-3">臨時の追加・除外</h3>
        {exceptions.add.length === 0 && exceptions.remove.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">臨時の追加・除外はありません。</p>
        ) : (
          <div className="space-y-3 mb-3">
            {exceptions.add.map(e => (
              <div key={`add-${e.id}`} className="flex items-start gap-2 text-sm">
                <span className="text-xs px-2 py-0.5 rounded bg-mado-accent text-white shrink-0">追加</span>
                <div className="flex-1">
                  <span className="font-medium text-mado-ink">{e.columnName}</span>
                  <span className="text-gray-400 ml-2">
                    〜{formatDate(e.expiresAt)}（付与: {e.grantedBy}）
                  </span>
                  <p className="text-gray-500">理由: {e.reason}</p>
                </div>
                <ExceptionRevokeButton userId={user.id} exceptionId={e.id} onChanged={load} onError={setError} />
              </div>
            ))}
            {exceptions.remove.map(e => (
              <div key={`remove-${e.id}`} className="flex items-start gap-2 text-sm">
                <span className="text-xs px-2 py-0.5 rounded border border-gray-300 text-mado-ink/40 shrink-0 line-through">
                  除外
                </span>
                <div className="flex-1">
                  <span className="font-medium text-mado-ink/60 line-through">{e.columnName}</span>
                  <span className="text-gray-400 ml-2">
                    〜{formatDate(e.expiresAt)}（付与: {e.grantedBy}）
                  </span>
                  <p className="text-gray-500">理由: {e.reason}</p>
                </div>
                <ExceptionRevokeButton userId={user.id} exceptionId={e.id} onChanged={load} onError={setError} />
              </div>
            ))}
          </div>
        )}
        <AddExceptionForm userId={user.id} onChanged={load} onError={setError} />
      </div>
    </div>
  );
}

function EditUserForm({
  user,
  onUpdated,
  onError,
}: {
  user: UserDetail['user'];
  onUpdated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(user.name);
    setDepartment(user.department);
    setRole(user.role);
    setIsActive(user.isActive);
  }, [user]);

  const dirty = name !== user.name || department !== user.department || role !== user.role || isActive !== user.isActive;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, department, role, isActive }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? '更新に失敗しました'); return; }
      onUpdated();
    } catch {
      onError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <h3 className="font-bold text-mado-ink mb-3">基本情報の編集</h3>
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        <label className="block text-sm">
          <span className="text-gray-600">氏名</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">部署</span>
          <input
            type="text"
            value={department}
            onChange={e => setDepartment(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">ロール</span>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          >
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm mt-6">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          <span className="text-gray-600">有効</span>
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting || !dirty}
        className="mt-3 px-4 py-1.5 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? '保存中…' : '保存'}
      </button>
    </form>
  );
}

function PasswordResetForm({ userId, onError }: { userId: number; onError: (msg: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (password !== confirm) {
      onError('パスワードが一致しません');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? 'リセットに失敗しました'); return; }
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch {
      onError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <h3 className="font-bold text-mado-ink mb-3">パスワードリセット</h3>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block text-sm">
          <span className="text-gray-600">新しいパスワード（8文字以上）</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={8}
            className="mt-1 w-56 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">確認</span>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            minLength={8}
            className="mt-1 w-56 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || password.length < 8}
          className="px-4 py-1.5 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? '処理中…' : 'リセット'}
        </button>
        {done && <span className="text-mado-head text-sm">変更しました</span>}
      </div>
    </form>
  );
}

function GrantButton({
  userId,
  group,
  onChanged,
  onError,
}: {
  userId: number;
  group: { id: string; label: string };
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? '付与に失敗しました'); return; }
      onChanged();
    } catch {
      onError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
      className="px-3 py-1.5 bg-mado-accent text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
    >
      + {group.label} を付与
    </button>
  );
}

function GrantActions({
  userId,
  grant,
  onChanged,
  onError,
}: {
  userId: number;
  grant: Grant;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const call = async (action: 'revoke' | 'extend') => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/grants/${grant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? '更新に失敗しました'); return; }
      onChanged();
    } catch {
      onError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <span className="flex gap-1 ml-auto">
      <button
        onClick={() => call('extend')}
        disabled={submitting}
        className="text-xs px-2 py-0.5 rounded border border-gray-300 text-mado-head hover:bg-mado-tint disabled:opacity-50"
      >
        延長
      </button>
      <button
        onClick={() => call('revoke')}
        disabled={submitting}
        className="text-xs px-2 py-0.5 rounded border border-gray-300 text-mado-ink/60 hover:bg-gray-50 disabled:opacity-50"
      >
        取り消し
      </button>
    </span>
  );
}

function ExceptionRevokeButton({
  userId,
  exceptionId,
  onChanged,
  onError,
}: {
  userId: number;
  exceptionId: number;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/exceptions/${exceptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? '取り消しに失敗しました'); return; }
      onChanged();
    } catch {
      onError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
      className="text-xs px-2 py-0.5 rounded border border-gray-300 text-mado-ink/60 hover:bg-gray-50 disabled:opacity-50 shrink-0"
    >
      取り消し
    </button>
  );
}

function AddExceptionForm({
  userId,
  onChanged,
  onError,
}: {
  userId: number;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [columns, setColumns] = useState<string[] | null>(null);
  const [effect, setEffect] = useState<'add' | 'remove'>('remove');
  const [columnName, setColumnName] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/admin/columns');
        if (!res.ok) return;
        const data = await res.json();
        setColumns(data);
        if (data.length > 0) setColumnName(data[0]);
      } catch {
        // 一覧取得に失敗しても手入力できるよう、エラーは無視する
      }
    })();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      onError('理由の入力は必須です');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/exceptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effect,
          columnName,
          reason,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? '追加に失敗しました'); return; }
      setReason('');
      setExpiresAt('');
      onChanged();
    } catch {
      onError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="pt-3 border-t border-gray-100 space-y-2">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block text-sm">
          <span className="text-gray-600">種別</span>
          <select
            value={effect}
            onChange={e => setEffect(e.target.value as 'add' | 'remove')}
            className="mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          >
            <option value="remove">除外</option>
            <option value="add">追加</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">対象列</span>
          {columns ? (
            <select
              value={columnName}
              onChange={e => setColumnName(e.target.value)}
              className="mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
            >
              {columns.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={columnName}
              onChange={e => setColumnName(e.target.value)}
              className="mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
            />
          )}
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">期限（空欄で次の3月31日）</span>
          <input
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            className="mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-gray-600">理由（必須）</span>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          required
          placeholder="例: 生活保護担当への異動に伴う申請書No.123"
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
        />
      </label>
      <button
        type="submit"
        disabled={submitting || !columnName || !reason.trim()}
        className="px-4 py-1.5 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? '追加中…' : '追加'}
      </button>
    </form>
  );
}
