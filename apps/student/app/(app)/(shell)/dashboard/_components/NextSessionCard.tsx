import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { SessionListItem } from '@gabby/types/session';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { HomeCard } from './HomeCard';

interface NextSessionCardProps {
  session: SessionListItem;
  timezone: string;
}

/** 次回ライブセッション（「今日やること」に出るほど直近でない場合に表示）。日時を主、コーチを従の2段で見せる */
export function NextSessionCard({ session, timezone }: NextSessionCardProps) {
  const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);

  return (
    <HomeCard title="次回のライブセッション">
      <Link
        href="/live-room"
        className="group -m-2 flex items-center gap-3 rounded-control p-2 hover:bg-slate-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 font-bold text-ink tabular-nums">
            <span className="text-lg">{slot.date}</span>
            <span className="text-base">{slot.time}</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <CoachAvatar iconPath={session.counterpart_icon_path} size={28} />
            <p className="truncate text-sm text-ink-muted">{session.counterpart_name} コーチ</p>
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-ink-muted transition-colors" />
      </Link>
    </HomeCard>
  );
}
