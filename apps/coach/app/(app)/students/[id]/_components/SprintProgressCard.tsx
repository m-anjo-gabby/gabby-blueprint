import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';

interface Props {
  progress: StudentSprintProgress;
}

const TYPE_ORDER = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);

export function SprintProgressCard({ progress }: Props) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Sprint Progress</CardTitle>
        <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1">
          Stage {progress.stage}
        </span>
      </CardHeader>
      <CardContent className="space-y-5 pt-2">
        {TYPE_ORDER.map((type) => {
          const level = (progress[type.dbKey as keyof StudentSprintProgress] as number) ?? type.minLevel;
          const percent = ((level - type.minLevel) / (type.maxLevel - type.minLevel)) * 100;
          const levelLabel = level === 0 && type.hasBasic ? 'Basic' : `Lv.${level}`;
          return (
            <div key={type.value}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700">{type.label}</span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {levelLabel} <span className="text-slate-300">/ Lv.{type.maxLevel}</span>
                </span>
              </div>
              <Progress value={Math.max(0, Math.min(100, percent))} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
