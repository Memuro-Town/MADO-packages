import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mado-soft">
      <header className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-bold text-mado-head">hub 管理画面</span>
          <Link href="/admin/users" className="text-sm text-mado-head hover:underline">
            ユーザー一覧
          </Link>
          <Link href="/admin/expirations" className="text-sm text-mado-head hover:underline">
            期限運用
          </Link>
          <Link href="/admin/audit-log" className="text-sm text-mado-head hover:underline">
            操作記録（決裁用）
          </Link>
          <Link href="/admin/resident-log" className="text-sm text-mado-head hover:underline">
            住民情報 閲覧記録
          </Link>
        </div>
        <Link href="/" className="text-sm text-gray-500 hover:text-mado-head">
          ← hubへ戻る
        </Link>
      </header>
      <main className="p-6">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
