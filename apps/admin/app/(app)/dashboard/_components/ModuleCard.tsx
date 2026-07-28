// apps/admin/app/(app)/dashboard/_components/ModuleCard.tsx
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardModuleSummary } from '@/actions/adminDashboardAction';
import { DASHBOARD_MODULE_CONFIG } from './moduleConfig';

type Props = {
  summary: DashboardModuleSummary;
};

export default function ModuleCard({ summary }: Props) {
  const config = DASHBOARD_MODULE_CONFIG[summary.key];
  const Icon = config.icon;
  const hasAlert = summary.alertCount > 0;

  return (
    <Link href={config.href} className="block h-full group">
      <Card className="h-full rounded-2xl border-slate-200 shadow-sm transition-all group-hover:shadow-md group-hover:border-indigo-200 group-hover:-translate-y-0.5">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className={`p-3 rounded-xl border ${config.accentClass}`}>
              <Icon size={22} />
            </div>
            <ArrowUpRight size={18} className="text-slate-300 transition-colors group-hover:text-indigo-500" />
          </div>

          <div className="mt-5">
            <h3 className="text-base font-bold text-slate-800">{config.title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{config.desc}</p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-end justify-between gap-2">
            <div>
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                {summary.count.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1.5">
                {summary.countLabel}
              </span>
            </div>

            {hasAlert ? (
              <Badge variant="outline" className="shrink-0 text-amber-700 bg-amber-50 border-amber-200 font-bold whitespace-nowrap">
                {summary.alertLabel} {summary.alertCount}件
              </Badge>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold whitespace-nowrap">
                <CheckCircle2 size={13} /> 問題なし
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}