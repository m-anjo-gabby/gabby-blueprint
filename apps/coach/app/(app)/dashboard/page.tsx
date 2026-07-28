import { Info } from 'lucide-react';
import DashboardHeader from './_components/DashboardHeader';
import StatGrid from './_components/StatGrid';

export default function Page() {
  return (
    <div className="space-y-8">
      <DashboardHeader />

      <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700">
        <Info size={16} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          初期構築のドラフト画面です。表示されている数値はサンプルデータであり、担当生徒・レッスン管理機能の実装に合わせて実データへ置き換えます。
        </p>
      </div>

      <StatGrid />
    </div>
  );
}
