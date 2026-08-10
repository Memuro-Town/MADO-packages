'use client';

import { useState, KeyboardEvent } from 'react';
import ResidentList, { ResidentRow } from './ResidentList';
import { authFetch } from '@/lib/authFetch';

interface ResidentSearchProps {
  onSelect: (resident: ResidentRow) => void;
  label?: string;
  placeholder?: string;
}

export default function ResidentSearch({
  onSelect,
  label = '住民検索',
  placeholder = '氏名・フリガナ・和暦7桁・西暦8桁・宛名番号',
}: ResidentSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResidentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) { setError('検索値を入力してください'); return; }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await authFetch(`/api/residents/search?q=${encodeURIComponent(q)}`);
      if (res.status === 401) return; // ログイン画面へリダイレクト済み
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '検索に失敗しました'); return; }
      setResults(data);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') search();
  };

  const handleSelect = (resident: ResidentRow) => {
    setResults(null);
    setQuery('');
    onSelect(resident);
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <h3 className="font-bold text-gray-800 mb-3 border-l-4 border-mado-head pl-2">{label}</h3>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-mado-accent"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? '検索中…' : '検索'}
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-1">
        例: 氏名「山田」・カナ「ヤマダ」・和暦 4050101（平成5年1月1日）・西暦 19930101・宛名番号 1234567
      </p>

      {results !== null && (
        <ResidentList
          residents={results}
          onSelect={handleSelect}
          title={results.length > 1 ? `${results.length}件見つかりました。対象者を選択してください。` : undefined}
        />
      )}
    </div>
  );
}
