// apps/coach/app/(app)/dashboard/_components/DashboardHeader.tsx
export default function DashboardHeader() {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
        <p className="text-xs text-slate-500 mt-1">
          担当生徒の学習状況とフォローが必要な項目をまとめて確認できます
        </p>
      </div>
      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase rounded-md tracking-wider border border-amber-100 shrink-0">
        Draft Preview
      </span>
    </div>
  );
}
