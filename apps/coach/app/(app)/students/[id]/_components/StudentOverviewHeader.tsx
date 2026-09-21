import Link from 'next/link';
import { ArrowLeft, BadgeCheck, BadgeX } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import type { StudentContractSessionSummary, StudentOverviewProfile, StudentSessionHistoryItem } from '@gabby/types/coachStudent';
import { SprintProgressRadar } from './SprintProgressRadar';
import { TodaysLessonPanel } from './TodaysLessonPanel';

interface Props {
  profile: StudentOverviewProfile;
  upcomingSession: StudentSessionHistoryItem | null;
}

function formatContractPeriod(startDate: string, endDate: string, timezone: string): string {
  return `${formatDateEn(startDate, timezone)} – ${formatDateEn(endDate, timezone)}`;
}

/**
 * サマリーは「自分の担当分」のみで完結させる（Total = own_scheduled + own_consumed +
 * own_unbooked）。ここにtotal_sessions（契約全体、他コーチ分を含む）を使ってしまうと、
 * 自分の内訳3つの合計と一致しない数字になり、「自分の生徒で未予約が無いか」を直感的に
 * リマインドするという目的から外れて混乱を招く。他コーチ担当分は行動につながらない
 * （book_makeup_sessionはスケジュールのcoach_idで予約先コーチが固定されるため、自分では
 * 予約できない）ため、主要4指標には含めず、件数のみのサブテキストとして分けて出す。
 */
function ContractSessionSummaryStats({ summary }: { summary: StudentContractSessionSummary }) {
  const ownTotal = summary.own_scheduled + summary.own_consumed + summary.own_unbooked;
  const stats: { label: string; value: number }[] = [
    { label: 'Total', value: ownTotal },
    { label: 'Scheduled', value: summary.own_scheduled },
    { label: 'Completed', value: summary.own_consumed },
    { label: 'Unbooked', value: summary.own_unbooked },
  ];

  return (
    <div className="mt-2 pt-2 border-t border-emerald-100/80">
      <div className="grid grid-cols-4 gap-1.5">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className={`text-sm font-bold ${s.label === 'Unbooked' && s.value > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
              {s.value}
            </p>
            <p className="text-[9px] font-semibold text-emerald-500/70 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>
      {summary.other_coach_sessions > 0 && (
        <p className="mt-1.5 text-[10px] text-emerald-600/70">
          + {summary.other_coach_sessions} session{summary.other_coach_sessions === 1 ? '' : 's'} handled by another coach
        </p>
      )}
    </div>
  );
}

export function StudentOverviewHeader({ profile, upcomingSession }: Props) {
  const { active_contract } = profile;

  return (
    <div className="space-y-4">
      <Link
        href="/students"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Students
      </Link>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-col lg:grid lg:grid-cols-[4fr_6fr] lg:items-start gap-5 lg:gap-10">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <UserAvatar userName={profile.user_name} iconPath={profile.icon_path} size={56} />
                <div>
                  <h1 className="text-xl font-bold text-slate-800 tracking-tight">{profile.user_name}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Timezone: {profile.timezone}</p>
                </div>
              </div>
              {active_contract ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 tracking-wide">
                    <BadgeCheck size={13} />
                    <span>Current Contract</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-emerald-700">
                    <p>
                      <span className="font-semibold text-emerald-500/80">Plan </span>
                      {active_contract.plan_name_en}
                    </p>
                    <p>
                      <span className="font-semibold text-emerald-500/80">Period </span>
                      {formatContractPeriod(active_contract.start_date, active_contract.end_date, profile.timezone)}
                    </p>
                  </div>
                  {profile.session_summary && <ContractSessionSummaryStats summary={profile.session_summary} />}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 tracking-wide">
                    <BadgeX size={13} />
                    <span>Current Contract</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">No active contract</p>
                </div>
              )}
            </div>
            <div className="lg:border-l lg:border-slate-100 lg:pl-8">
              <SprintProgressRadar studentId={profile.student_id} progress={profile.sprint_progress} />
            </div>
          </div>
        </div>
        <div className="border-t border-indigo-100 bg-linear-to-br from-indigo-50/80 to-indigo-50/10 px-5 py-4">
          <TodaysLessonPanel studentId={profile.student_id} upcomingSession={upcomingSession} />
        </div>
      </div>
    </div>
  );
}
