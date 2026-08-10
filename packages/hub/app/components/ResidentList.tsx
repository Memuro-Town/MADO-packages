'use client';

import StatusBadge from './StatusBadge';
import { toJapaneseEra } from '@/lib/date';

export interface ResidentRow {
  宛名番号: number | string;
  世帯番号: number | string;
  氏名: string;
  氏名_フリガナ: string;
  生年月日: string;
  住所: string;
  住民状態: number | string;
}

interface ResidentListProps {
  residents: ResidentRow[];
  onSelect: (resident: ResidentRow) => void;
  title?: string;
}

export default function ResidentList({ residents, onSelect, title }: ResidentListProps) {
  if (residents.length === 0) {
    return (
      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
        該当する住民が見つかりませんでした。
      </div>
    );
  }

  return (
    <div className="mt-3">
      {title && <p className="text-sm font-medium text-gray-700 mb-2">{title}</p>}
      <div className="border border-gray-200 rounded-md overflow-hidden">
        {residents.map((r, i) => (
          <button
            key={String(r.宛名番号)}
            onClick={() => onSelect(r)}
            className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-mado-tint transition-colors ${
              i !== 0 ? 'border-t border-gray-100' : ''
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{r.氏名}</span>
                <span className="text-gray-500 text-sm">{r.氏名_フリガナ}</span>
                <StatusBadge status={r.住民状態} />
              </div>
              <div className="text-sm text-gray-600">
                {toJapaneseEra(r.生年月日)} &nbsp;|&nbsp; {r.住所}
              </div>
            </div>
            <span className="text-mado-head text-sm ml-4 shrink-0">選択 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
