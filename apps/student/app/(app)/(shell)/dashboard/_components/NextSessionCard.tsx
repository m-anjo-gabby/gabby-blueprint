import Link from 'next/link';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import type { SessionListItem } from '@gabby/types/session';
import { HomeCard } from './HomeCard';

interface NextSessionCardProps {
  session: SessionListItem;
  timezone: string;
}

const formatDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(iso));

const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** 次回ライブセッション（「今日やること」に出るほど直近でない場合に表示）。日時を主、コーチを従の2段で見せる */
export function NextSessionCard({ session, timezone }: NextSessionCardProps) {
  const coachIconUrl = getProfileIconUrl(session.counterpart_icon_path);

  return (
    <HomeCard title="次回のライブセッション">
      <Link
        href="/live-room"
        className="group -m-2 flex items-center gap-3 rounded-control p-2 hover:bg-slate-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 font-bold text-ink tabular-nums">
            <span className="text-lg">{formatDate(session.start_datetime, timezone)}</span>
            <span className="text-base">
              {formatTime(session.start_datetime, timezone)}〜{formatTime(session.end_datetime, timezone)}
            </span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-brand-500">
              {coachIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coachIconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <GraduationCap size={15} />
              )}
            </div>
            <p className="truncate text-sm text-ink-muted">{session.counterpart_name} コーチ</p>
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-ink-muted transition-colors" />
      </Link>
    </HomeCard>
  );
}
