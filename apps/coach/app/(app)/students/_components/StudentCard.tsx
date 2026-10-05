'use client';

import Link from 'next/link';
import { ChevronRight, BadgeCheck, BadgeX, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/common/UserAvatar';
import { formatDateEn, formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import type { AssignedStudentSummary } from '@gabby/types/coachStudent';

interface Props {
  student: AssignedStudentSummary;
}

export function StudentCard({ student }: Props) {
  const { latest_contract, next_session } = student;
  const isCurrent = latest_contract?.is_current ?? false;
  const timezone = useTimezone();

  return (
    <Link href={`/students/${student.student_id}`}>
      <Card className="h-full rounded-2xl border-slate-200 shadow-sm hover:border-brand-200 hover:shadow-md transition-all">
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

          <div
            className={`mt-4 rounded-xl border px-3.5 py-2.5 ${
              isCurrent ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div
              className={`flex items-center gap-1.5 text-[11px] font-bold tracking-wide ${
                isCurrent ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {isCurrent ? <BadgeCheck size={13} /> : <BadgeX size={13} />}
              <span>{isCurrent ? 'Current Contract' : 'Last Contract'}</span>
            </div>
            {latest_contract ? (
              <div className={`mt-1.5 space-y-0.5 text-xs ${isCurrent ? 'text-emerald-700' : 'text-slate-500'}`}>
                <p>
                  <span className={`font-semibold ${isCurrent ? 'text-emerald-500/80' : 'text-slate-400'}`}>Plan </span>
                  {latest_contract.plan_name_en}
                </p>
                <p>
                  <span className={`font-semibold ${isCurrent ? 'text-emerald-500/80' : 'text-slate-400'}`}>Period </span>
                  {formatDateEn(latest_contract.start_date)} &ndash; {formatDateEn(latest_contract.end_date)}
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">No contract yet</p>
            )}
          </div>

          {next_session && (
            <div className="mt-2.5 flex items-center gap-1.5 px-3.5 text-[11px] font-semibold text-brand">
              <CalendarClock size={12} className="shrink-0" />
              <span className="truncate">Next: {formatDateTimeEn(next_session.start_datetime, timezone)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
