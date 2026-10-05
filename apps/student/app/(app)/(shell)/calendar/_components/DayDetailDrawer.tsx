'use client';

import { CalendarClock, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { SESSION_STATUS } from '@gabby/types/session';
import { getSessionStatusBadge } from '@/constants/session';
import { CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import { CalendarEventCard, formatEventTimeInZone as formatTimeInZone } from '@/components/calendarEvent/CalendarEventCard';
import { SessionActionTarget } from './SessionActionDialog';

const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

interface DayDetailDrawerProps {
  date: string | null; // YYYY-MM-DD
  items: CalendarItem[];
  timezone: string;
  hasBookableTickets: boolean;
  onClose: () => void;
  onActionRequested: (target: SessionActionTarget) => void;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
  onBookMakeupRequested: (date: string) => void;
}

function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS_JA[new Date(y, m - 1, d).getDay()];
}

export function DayDetailDrawer({
  date,
  items,
  timezone,
  hasBookableTickets,
  onClose,
  onActionRequested,
  onParticipationChanged,
  onBookMakeupRequested,
}: DayDetailDrawerProps) {
  const sorted = items.slice().sort((a, b) => a.data.start_datetime.localeCompare(b.data.start_datetime));

  return (
    <Drawer open={!!date} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-w-2xl mx-auto max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base font-bold text-ink">
            {date ? `${formatZonedDateJapanese(date, timezone)}（${weekdayLabel(date)}）` : ''}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto space-y-3">
          {hasBookableTickets && date && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full text-brand border-brand-200 hover:bg-brand-soft"
              onClick={() => onBookMakeupRequested(date)}
            >
              <Ticket size={13} />
              この日で未予約のセッションをリクエストする
            </Button>
          )}

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarClock size={20} className="text-ink-subtle mb-2" />
              <p className="text-sm font-bold text-ink-muted">この日の予定はありません</p>
            </div>
          ) : (
            sorted.map((item) => {
              if (item.kind === 'session') {
                const session = item.data;
                const badge = getSessionStatusBadge(session);
                const isFuture = new Date(session.start_datetime) > new Date();
                const canAct = session.status === SESSION_STATUS.SCHEDULED && isFuture;
                return (
                  <article key={getCalendarItemKey(item)} className="bg-white rounded-2xl border border-line/70 shadow-sm p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-ink">
                          {formatTimeInZone(session.start_datetime, timezone)} - {formatTimeInZone(session.end_datetime, timezone)}
                        </p>
                        <p className="text-xs text-ink-muted mt-0.5">{session.counterpart_name}コーチ</p>
                      </div>
                      <span className={cn('text-[11px] font-bold uppercase px-2 py-1 rounded-md border shrink-0', badge.className)}>
                        {badge.label}
                      </span>
                    </div>

                    {session.cancel_reason && (
                      <p className="text-xs text-ink-muted bg-slate-50 border border-line/70 rounded-lg px-3 py-2">{session.cancel_reason}</p>
                    )}

                    {canAct && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => onActionRequested({ session, mode: 'cancel' })}
                        >
                          <X size={13} />
                          キャンセル
                        </Button>
                      </div>
                    )}
                  </article>
                );
              }

              return (
                <CalendarEventCard
                  key={getCalendarItemKey(item)}
                  event={item.data}
                  timezone={timezone}
                  onParticipationChanged={onParticipationChanged}
                />
              );
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
