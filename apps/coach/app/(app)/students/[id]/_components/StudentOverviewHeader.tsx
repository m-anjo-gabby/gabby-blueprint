import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, BadgeCheck, BadgeX } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';

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
      <Link
        href="/students"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Students
      </Link>
      <div className="flex items-center gap-4">
        <UserAvatar userName={profile.user_name} iconPath={profile.icon_path} size={56} />
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">{profile.user_name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">Timezone: {profile.timezone}</p>
          {active_contract ? (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1 mt-1.5">
              <BadgeCheck size={13} />
              <span>{active_contract.plan_name}</span>
              <span className="text-emerald-400 font-normal">
                ({formatContractPeriod(active_contract.start_date, active_contract.end_date)})
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 mt-1.5">
              <BadgeX size={13} />
              <span>No active contract</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
