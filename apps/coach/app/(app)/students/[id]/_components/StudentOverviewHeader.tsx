import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, BadgeCheck, BadgeX, Video } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';
import { SprintProgressRadar } from './SprintProgressRadar';

interface Props {
  profile: StudentOverviewProfile;
}

function formatContractPeriod(startDate: string, endDate: string): string {
  return `${format(new Date(startDate), 'MMM d, yyyy')} – ${format(new Date(endDate), 'MMM d, yyyy')}`;
}

export function StudentOverviewHeader({ profile }: Props) {
  const { active_contract } = profile;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/students"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Students
        </Link>
        <Link
          href={`/students/${profile.student_id}/room`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-3.5 py-2 rounded-full shadow-sm"
        >
          <Video size={14} />
          Start Live Session
        </Link>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5 lg:gap-14 lg:w-fit lg:mx-auto">
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
          <div className="lg:w-[28rem] lg:shrink-0 lg:border-l lg:border-slate-100 lg:pl-8">
            <SprintProgressRadar studentId={profile.student_id} progress={profile.sprint_progress} />
          </div>
        </div>
      </div>
    </div>
  );
}
