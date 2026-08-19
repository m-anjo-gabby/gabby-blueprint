'use client';

import { CalendarClock, ExternalLink, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { SESSION_STATUS } from '@gabby/types/session';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { CALENDAR_EVENT_TYPES } from '@gabby/types/calendarEvent';
import { CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import { SessionActionTarget } from './SessionActionDialog';

const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

interface DayDetailDrawerProps {
  date: string | null; // YYYY-MM-DD
  items: CalendarItem[];
  timezone: string;
  onClose: () => void;
  onActionRequested: (target: SessionActionTarget) => void;
}

function formatTimeInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
}

function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS_JA[new Date(y, m - 1, d).getDay()];
}

export function DayDetailDrawer({ date, items, timezone, onClose, onActionRequested }: DayDetailDrawerProps) {
  const sorted = items.slice().sort((a, b) => a.data.start_datetime.localeCompare(b.data.start_datetime));

  return (
    <Drawer open={!!date} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-w-2xl mx-auto max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base font-black text-slate-800">
            {date ? `${formatZonedDateJapanese(date, timezone)}（${weekdayLabel(date)}）` : ''}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto space-y-3">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarClock size={20} className="text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-500">この日の予定はありません</p>
            </div>
          ) : (
            sorted.map((item) => {
              if (item.kind === 'session') {
                const session = item.data;
                const badge = SESSION_STATUS_BADGE[session.status];
                const isFuture = new Date(session.start_datetime) > new Date();
                const canAct = session.status === SESSION_STATUS.SCHEDULED && isFuture;
                return (
                  <article key={getCalendarItemKey(item)} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-800">
                          {formatTimeInZone(session.start_datetime, timezone)} - {formatTimeInZone(session.end_datetime, timezone)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{session.counterpart_name}コーチ</p>
                      </div>
                      <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0', badge.className)}>
                        {badge.label}
                      </span>
                    </div>

                    {session.cancel_reason && (
                      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{session.cancel_reason}</p>
                    )}

                    {canAct && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onActionRequested({ session, mode: 'reschedule' })}
                        >
                          <RotateCcw size={13} />
                          振替
                        </Button>
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

              const event = item.data;
              const badge = CALENDAR_EVENT_TYPES[event.event_type];
              return (
                <article key={getCalendarItemKey(item)} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border inline-block mb-1', badge.badgeClass)}>
                        {badge.label}
                      </span>
                      <p className="text-sm font-black text-slate-800">{event.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {event.end_datetime
                          ? `${formatTimeInZone(event.start_datetime, timezone)} - ${formatTimeInZone(event.end_datetime, timezone)}`
                          : `${formatTimeInZone(event.start_datetime, timezone)}（開始日時のみ）`}
                      </p>
                    </div>
                  </div>

                  {event.description && (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {event.description}
                    </p>
                  )}

                  {event.location_url && (
                    <a
                      href={event.location_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      <ExternalLink size={13} />
                      参加リンクを開く
                    </a>
                  )}
                </article>
              );
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
