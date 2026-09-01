import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, BadgeCheck, BadgeX } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import type { StudentOverviewProfile, StudentSessionHistoryItem } from '@gabby/types/coachStudent';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import { SprintProgressRadar } from './SprintProgressRadar';
import { TodaysLessonPanel } from './TodaysLessonPanel';

interface Props {
  profile: StudentOverviewProfile;
  sessions: StudentSessionHistoryItem[];
  lessonSprints: LessonSprintHistoryListItem[];
}

function formatContractPeriod(startDate: string, endDate: string): string {
  return `${format(new Date(startDate), 'MMM d, yyyy')} – ${format(new Date(endDate), 'MMM d, yyyy')}`;
}

export function StudentOverviewHeader({ profile, sessions, lessonSprints }: Props) {
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
                      {active_contract.plan_name}
                    </p>
                    <p>
                      <span className="font-semibold text-emerald-500/80">Period </span>
                      {formatContractPeriod(active_contract.start_date, active_contract.end_date)}
                    </p>
                  </div>
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
          <TodaysLessonPanel studentId={profile.student_id} sessions={sessions} lessonSprints={lessonSprints} />
        </div>
      </div>
    </div>
  );
}
