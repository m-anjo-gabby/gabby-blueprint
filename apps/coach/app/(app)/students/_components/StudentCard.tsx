import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/common/UserAvatar';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import type { AssignedStudentSummary } from '@gabby/types/coachStudent';

interface Props {
  student: AssignedStudentSummary;
}

const TYPE_ORDER = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);

export function StudentCard({ student }: Props) {
  return (
    <Link href={`/students/${student.student_id}`}>
      <Card className="h-full rounded-2xl border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar userName={student.user_name} iconPath={student.icon_path} size={44} />
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800 truncate">{student.user_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {student.active_slot_count}x/week &middot; Stage {student.stage}
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {TYPE_ORDER.map((type) => {
              const level = student[type.dbKey as keyof AssignedStudentSummary] as number;
              return (
                <div key={type.value} className="text-center px-1.5 py-2 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide truncate">
                    {type.label.replace('UG ', '')}
                  </p>
                  <p className="text-sm font-black text-indigo-600 mt-0.5">{level}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
