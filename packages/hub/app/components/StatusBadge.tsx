'use client';

const STATUS_MAP: Record<number, { label: string; className: string }> = {
  2: { label: '★★転出者★★', className: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
  3: { label: '★★死亡者★★', className: 'bg-gray-200 text-gray-700 border border-gray-400' },
  9: { label: '★★消除者★★', className: 'bg-red-600 text-white border border-red-800' },
};

interface StatusBadgeProps {
  status: number | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const info = STATUS_MAP[parseInt(String(status), 10)];
  if (!info) return null;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${info.className}`}>
      {info.label}
    </span>
  );
}
