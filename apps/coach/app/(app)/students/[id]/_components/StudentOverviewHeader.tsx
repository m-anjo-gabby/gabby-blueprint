import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';

interface Props {
  profile: StudentOverviewProfile;
}

export function StudentOverviewHeader({ profile }: Props) {
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
        </div>
      </div>
    </div>
  );
}
