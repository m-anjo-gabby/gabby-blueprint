import Link from 'next/link';
import { ChevronRight, Video } from 'lucide-react';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import type { SessionListItem } from '@gabby/types/session';
import { HomeCard } from './HomeCard';

interface NextSessionCardProps {
  session: SessionListItem;
  timezone: string;
}

/** 次回ライブセッション（「今日やること」に出るほど直近でない場合に表示） */
export function NextSessionCard({ session, timezone }: NextSessionCardProps) {
  return (
    <HomeCard title="次回のライブセッション">
      <Link
        href="/live-room"
        className="group -m-2 flex items-center gap-3 rounded-control p-2 hover:bg-slate-50 transition-colors"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
          <Video size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{session.counterpart_name} コーチ</p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatDateTimeByZone(session.start_datetime, timezone, false)}</p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-ink-muted transition-colors" />
      </Link>
    </HomeCard>
  );
}
