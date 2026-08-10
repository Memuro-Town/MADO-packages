'use client';

import { useEffect, useState } from 'react';
import { toJapaneseEra, calcAge } from '@/lib/date';
import { copyTextToClipboard } from '@/lib/clipboard';
import { authFetch } from '@/lib/authFetch';

type ResidentDetail = Record<string, unknown>;

interface HouseholdMember {
  カナ氏名: string;
  氏名: string;
  続柄: string;
  生年月日: string;
  住民ｺｰﾄﾞ: number | string;
  住民状態: number | string;
}

interface HouseholdOptions {
  enabled: boolean;
  birthdate: boolean;
  age: boolean;
}

interface FieldDef {
  key: string;
  label: string;
  format?: (val: string) => string;
  compute?: (detail: ResidentDetail) => string;
}

interface FieldGroup {
  groupLabel: string;
  fields: FieldDef[];
}

const RESIDENT_STATUS: Record<number, string> = {
  1: '現住民',
  2: '転出者',
  3: '死亡者',
  9: '消除者',
};

function formatPostal(val: string): string {
  const digits = val.replace(/-/g, '');
  if (digits.length !== 7) return val;
  return `〒${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function formatStatus(val: string): string {
  return RESIDENT_STATUS[parseInt(val, 10)] ?? val;
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    groupLabel: '基本情報',
    fields: [
      { key: '氏名', label: '氏名' },
      { key: 'カナ氏名', label: 'フリガナ' },
      { key: '生年月日', label: '生年月日', format: toJapaneseEra },
      { key: '__age__', label: '年齢', compute: (d) => calcAge(String(d['生年月日'] ?? '')) },
      { key: '性別', label: '性別' },
      { key: '住民状態', label: '住民状態', format: formatStatus },
    ],
  },
  {
    groupLabel: '住所',
    fields: [
      { key: '郵便番号', label: '郵便番号', format: formatPostal },
      { key: '市町村名', label: '市町村名' },
      { key: '住所', label: '住所' },
      { key: '方書', label: '方書' },
      { key: '行政区コード', label: '行政区コード' },
    ],
  },
  {
    groupLabel: '世帯',
    fields: [
      { key: '世帯主名', label: '世帯主名' },
    ],
  },
  {
    groupLabel: '本籍・戸籍',
    fields: [
      { key: '本籍住所＋番地', label: '本籍' },
      { key: '筆頭者', label: '筆頭者' },
    ],
  },
  {
    groupLabel: '識別コード',
    fields: [
      { key: '住民ｺｰﾄﾞ', label: '住民コード（宛名番号）' },
      { key: '世帯ｺｰﾄﾞ', label: '世帯コード' },
    ],
  },
];

const ALL_KEYS = FIELD_GROUPS.flatMap(g => g.fields.map(f => f.key));
const DEFAULT_KEYS = new Set(['氏名', '郵便番号', '住所']);

interface Props {
  atenaCode: number | string;
}

export default function ResidentDataExport({ atenaCode }: Props) {
  const [detail, setDetail] = useState<ResidentDetail | null>(null);
  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_KEYS));
  const [hhOpts, setHhOpts] = useState<HouseholdOptions>({
    enabled: true,
    birthdate: false,
    age: false,
  });
  const [selectedMemberCodes, setSelectedMemberCodes] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<string[]>([]);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<[string, string, string, string, string]>(['', '', '', '', '']);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setHousehold([]);

    authFetch(`/api/residents/${atenaCode}`)
      .then(async (res) => {
        if (res.status === 401) return; // ログイン画面へリダイレクト済み
        const data = await res.json();
        if (data.error) { setError(data.error); return; }
        setDetail(data as ResidentDetail);
        const householdCode = data['世帯ｺｰﾄﾞ'];
        if (householdCode) {
          const hhRes = await authFetch(`/api/households/${householdCode}`);
          if (hhRes.status === 401) return; // ログイン画面へリダイレクト済み
          const hhData = await hhRes.json();
          const members = Array.isArray(hhData) ? hhData : [];
          setHousehold(members);
          setSelectedMemberCodes(new Set());
        }
      })
      .catch(() => setError('通信エラーが発生しました'))
      .finally(() => setLoading(false));
  }, [atenaCode]);

  useEffect(() => {
    setColumnsError(null);
    authFetch('/api/residents/columns')
      .then(async (res) => {
        if (res.status === 401) return; // ログイン画面へリダイレクト済み
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) {
          setColumnsError('カスタム列の候補を取得できませんでした');
          return;
        }
        setColumns(data);
      })
      .catch(() => setColumnsError('通信エラーが発生しました（カスタム列の候補）'));
  }, []);

  useEffect(() => {
    const active = customFields.filter(Boolean);
    setExtrasError(null);
    if (active.length === 0) { setCustomValues({}); return; }
    authFetch(`/api/residents/${atenaCode}/extras?cols=${active.join(',')}`)
      .then(async (res) => {
        if (res.status === 401) return; // ログイン画面へリダイレクト済み
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          // 失敗時は customValues を空にする（取得できていない値を空欄のまま
          // コピー・出力させてしまうと、セッション切れ等の失敗に気づかないまま
          // 誤った（空の）情報を業務に使ってしまう危険があるため、必ずエラーを表示する）
          setCustomValues({});
          setExtrasError((data as { error?: string } | null)?.error ?? 'カスタム列の値を取得できませんでした');
          return;
        }
        setCustomValues(
          Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')]))
        );
      })
      .catch(() => {
        setCustomValues({});
        setExtrasError('通信エラーが発生しました（カスタム列の値）');
      });
  }, [customFields, atenaCode]);

  const toggleField = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (fields: FieldDef[]) => {
    const keys = fields.map(f => f.key);
    const allChecked = keys.every(k => selected.has(k));
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const getDisplayValue = (field: FieldDef): string => {
    if (!detail) return '';
    if (field.compute) return field.compute(detail);
    const raw = String(detail[field.key] ?? '');
    return field.format ? field.format(raw) : raw;
  };

  const toggleMember = (code: string) => {
    setSelectedMemberCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAllMembers = () => {
    const allCodes = household.map(m => String(m.住民ｺｰﾄﾞ));
    const allSelected = allCodes.every(c => selectedMemberCodes.has(c));
    setSelectedMemberCodes(allSelected ? new Set() : new Set(allCodes));
  };

  const activeMembers = (): HouseholdMember[] =>
    household.filter(m => selectedMemberCodes.has(String(m.住民ｺｰﾄﾞ)));

  const buildHouseholdColumns = () => {
    const headers: string[] = [];
    const values: string[] = [];
    activeMembers().forEach((m, i) => {
      const n = i + 1;
      headers.push(`世帯員${n}氏名`, `世帯員${n}続柄`, `世帯員${n}住民状態`);
      values.push(m.氏名, m.続柄, RESIDENT_STATUS[parseInt(String(m.住民状態), 10)] ?? String(m.住民状態));
      if (hhOpts.birthdate) {
        headers.push(`世帯員${n}生年月日`);
        values.push(toJapaneseEra(m.生年月日));
      }
      if (hhOpts.age) {
        headers.push(`世帯員${n}年齢`);
        values.push(calcAge(m.生年月日));
      }
    });
    return { headers, values };
  };

  const buildRows = () => {
    const allFields = FIELD_GROUPS.flatMap(g => g.fields);
    const active = allFields.filter(f => selected.has(f.key));
    const headers = active.map(f => f.label);
    const values = active.map(f => getDisplayValue(f));

    customFields.forEach(col => {
      if (!col) return;
      headers.push(col);
      values.push(customValues[col] ?? '');
    });

    if (hhOpts.enabled && household.length > 0) {
      const { headers: hhH, values: hhV } = buildHouseholdColumns();
      headers.push(...hhH);
      values.push(...hhV);
    }

    return { headers, values };
  };

  const handleCopy = async () => {
    const { headers, values } = buildRows();
    if (values.length === 0) return;
    const text = includeHeaders
      ? headers.join('\t') + '\n' + values.join('\t')
      : values.join('\t');
    const ok = await copyTextToClipboard(text);
    if (!ok) {
      alert('コピーに失敗しました');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setIncludeHeaders(false);
  };

  const handleDownloadCsv = () => {
    const { headers, values } = buildRows();
    if (values.length === 0) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = includeHeaders
      ? [headers.map(esc).join(','), values.map(esc).join(',')]
      : [values.map(esc).join(',')];
    const csv = '﻿' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `住民情報_${String(atenaCode)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setIncludeHeaders(false);
  };

  if (loading) return <div className="text-center text-gray-400 text-sm py-4">情報を取得中…</div>;
  if (error) return <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>;
  if (!detail) return null;

  return (
    <>
      {/* メイン：住民情報フィールド選択 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
        <h3 className="font-bold text-gray-800 border-l-4 border-mado-head pl-2">出力する項目を選択</h3>

        <div className="space-y-4">
          {FIELD_GROUPS.map(group => {
            const allChecked = group.fields.every(f => selected.has(f.key));
            const someChecked = group.fields.some(f => selected.has(f.key));
            return (
              <div key={group.groupLabel}>
                <button
                  onClick={() => toggleGroup(group.fields)}
                  className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 hover:text-gray-700"
                >
                  <span className={`inline-flex w-3.5 h-3.5 border rounded items-center justify-center text-white text-[9px]
                    ${allChecked ? 'bg-mado-head border-mado-head' : someChecked ? 'bg-mado-accent border-mado-accent' : 'border-gray-300'}`}>
                    {(allChecked || someChecked) && '✓'}
                  </span>
                  {group.groupLabel}
                </button>
                <div className="grid grid-cols-1 gap-1.5 ml-5">
                  {group.fields.map(f => (
                    <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggleField(f.key)} className="accent-mado-head" />
                      <span className="text-gray-500 w-28 shrink-0">{f.label}</span>
                      <span className="text-gray-900 font-medium">{getDisplayValue(f)}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* カスタム列 */}
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">カスタム列（任意）</p>
          {columnsError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {columnsError}
            </div>
          )}
          {extrasError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {extrasError}
            </div>
          )}
          {customFields.map((col, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8 shrink-0">列{i + 1}</span>
              <select
                value={col}
                onChange={e => {
                  const next = [...customFields] as [string, string, string, string, string];
                  next[i] = e.target.value;
                  setCustomFields(next);
                }}
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-700 bg-white"
              >
                <option value="">-- 選択しない --</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {col && (
                <span className="text-xs text-gray-600 w-32 truncate shrink-0">
                  {customValues[col] ?? '…'}
                </span>
              )}
            </div>
          ))}
        </div>

      </div>

      {/* 下段：世帯員一覧 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 border-l-4 border-mado-head pl-2">世帯員一覧</h3>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hhOpts.enabled}
              onChange={e => setHhOpts(o => ({ ...o, enabled: e.target.checked }))}
              className="accent-mado-head"
            />
            <span className="text-gray-600">出力に含める</span>
          </label>
        </div>

        {/* サブオプション */}
        <div className="flex gap-4 text-sm">
          {([{ key: 'birthdate', label: '生年月日' }, { key: 'age', label: '年齢' }] as const).map(opt => (
            <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
              <input
                type="checkbox"
                checked={hhOpts[opt.key]}
                onChange={e => setHhOpts(o => ({ ...o, [opt.key]: e.target.checked }))}
                className="accent-mado-accent"
              />
              {opt.label}
            </label>
          ))}
        </div>

        {/* 世帯員個別選択 */}
        {household.length === 0 ? (
          <p className="text-gray-400 text-sm">世帯員なし</p>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="pb-1.5">
              <button
                onClick={toggleAllMembers}
                className="text-xs text-mado-head hover:underline"
              >
                {household.every(m => selectedMemberCodes.has(String(m.住民ｺｰﾄﾞ))) ? '全員解除' : '全員選択'}
              </button>
            </div>
            {household.map((m, i) => {
              const code = String(m.住民ｺｰﾄﾞ);
              const checked = selectedMemberCodes.has(code);
              const extras: string[] = [];
              if (hhOpts.birthdate) extras.push(toJapaneseEra(m.生年月日));
              if (hhOpts.age) extras.push(calcAge(m.生年月日));
              return (
                <label key={code} className="flex items-center gap-2 py-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMember(code)}
                    className="accent-mado-head"
                  />
                  <span className="text-gray-400 text-xs w-12 shrink-0">世帯員{i + 1}</span>
                  <span className={`font-medium ${checked ? 'text-gray-900' : 'text-gray-400'}`}>{m.氏名}</span>
                  <span className="text-gray-500 text-xs">{m.続柄}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${parseInt(String(m.住民状態), 10) === 1 ? 'text-mado-head bg-mado-tint' : 'text-gray-400 bg-gray-100'}`}>
                    {RESIDENT_STATUS[parseInt(String(m.住民状態), 10)] ?? m.住民状態}
                  </span>
                  {extras.length > 0 && (
                    <span className="text-gray-400 text-xs">{extras.join('・')}</span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400">
          出力列: 世帯員1氏名・続柄・住民状態{hhOpts.birthdate ? '・生年月日' : ''}{hhOpts.age ? '・年齢' : ''}　→　世帯員2…（人数分）
        </p>
      </div>

      {/* 出力ボタン */}
      <div className="flex gap-3">
        <button
          onClick={handleCopy}
          disabled={selected.size === 0 && !hhOpts.enabled}
          className="flex-1 py-3 bg-mado-head text-white text-sm rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity font-medium"
        >
          {copied ? '✓ コピーしました' : 'クリップボードにコピー（Excel貼り付け用）'}
        </button>
        <button
          onClick={handleDownloadCsv}
          disabled={selected.size === 0 && !hhOpts.enabled}
          className="px-6 py-3 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 disabled:opacity-40 transition-colors"
        >
          CSV
        </button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">タブ区切り。Excelに直接貼り付けられます。</p>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeHeaders}
            onChange={e => setIncludeHeaders(e.target.checked)}
            className="accent-mado-head"
          />
          <span className="text-xs text-gray-500">列名を含める</span>
        </label>
      </div>
    </>
  );
}
