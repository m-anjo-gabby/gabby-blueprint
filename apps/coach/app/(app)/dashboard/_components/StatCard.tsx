// apps/coach/app/(app)/dashboard/_components/StatCard.tsx
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { StatEntry } from './statsConfig';

type Props = {
  stat: StatEntry;
};

export default function StatCard({ stat }: Props) {
  const Icon = stat.icon;
  const hasAlert = stat.alertCount > 0;

  return (
    <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-xl border ${stat.accentClass}`}>
            <Icon size={22} />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-base font-bold text-slate-800">{stat.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{stat.desc}</p>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-end justify-between gap-2">
          <div>
            <span className="text-2xl font-black text-slate-900 tabular-nums">
              {stat.value}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1.5">
              {stat.valueLabel}
            </span>
          </div>

          {hasAlert ? (
            <Badge variant="outline" className="shrink-0 text-amber-700 bg-amber-50 border-amber-200 font-bold whitespace-nowrap">
              {stat.alertLabel} {stat.alertCount}件
            </Badge>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold whitespace-nowrap">
              <CheckCircle2 size={13} /> 問題なし
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
