import { CalendarPlus, Repeat, Shuffle } from 'lucide-react';
import { CoachIncomingRequestItem } from '@gabby/types/coachInbox';

const KIND_META: Record<CoachIncomingRequestItem['kind'], { label: string; icon: typeof Repeat; className: string }> = {
  matching: { label: 'Matching Request', icon: Repeat, className: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  booking: { label: 'New Booking', icon: CalendarPlus, className: 'bg-sky-50 text-sky-600 border-sky-200' },
  reschedule_proposal: { label: 'Reschedule Proposal', icon: Shuffle, className: 'bg-amber-50 text-amber-600 border-amber-200' },
};

interface RequestKindTagProps {
  kind: CoachIncomingRequestItem['kind'];
}

/**
 * Pending/History一覧にmatching・booking・reschedule_proposalの3種類が混在表示される
 * ため、各カード共通でリクエストの種類を一目で判別できるようにするタグ。
 */
export function RequestKindTag({ kind }: RequestKindTagProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${meta.className}`}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}
