'use client';

import { useState } from 'react';
import ResidentSearch from './components/ResidentSearch';
import { ResidentRow } from './components/ResidentList';
import ResidentDataExport from './components/ResidentDataExport';
import UserBadge from './components/UserBadge';

export default function Home() {
  const [selected, setSelected] = useState<ResidentRow | null>(null);

  const handleSelect = (resident: ResidentRow) => {
    setSelected(resident);
  };

  return (
    <main className="min-h-screen bg-mado-soft p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="relative text-center mb-4">
          <div className="absolute right-0 top-0">
            <UserBadge />
          </div>
          <h1 className="text-2xl font-bold text-mado-head flex items-center justify-center gap-2">
            <img src="/mado_wordmark.png" alt="MADO" width={32} height={32} className="inline-block" />
            hub
          </h1>
        </div>

        <ResidentSearch onSelect={handleSelect} />

        {selected && (
          <ResidentDataExport atenaCode={selected.宛名番号} />
        )}

      </div>
    </main>
  );
}
