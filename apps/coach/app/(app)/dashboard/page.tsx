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
          This is an initial draft screen. The figures shown are sample data and will be replaced with real data once the student assignment and lesson management features are implemented.
        </p>
      </div>

      <StatGrid />
    </div>
  );
}
