// apps/admin/app/(app)/dashboard/_components/DashboardHeader.tsx
export default function DashboardHeader() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
      <p className="text-xs text-slate-500 mt-1">
        主要機能の登録状況と、対応が必要な項目をまとめて確認できます
      </p>
    </div>
  );
}