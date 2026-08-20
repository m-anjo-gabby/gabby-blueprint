'use client';

import { useState } from 'react';
import { Check, CalendarClock, CheckCircle2, Copy, ExternalLink, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { SESSION_STATUS } from '@gabby/types/session';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { CalendarEventItem, CALENDAR_EVENT_TYPES } from '@gabby/types/calendarEvent';
import { CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import { joinCalendarEvent, cancelCalendarEventParticipation } from '@/actions/calendarEventAction';
import { SessionActionTarget } from './SessionActionDialog';

const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

interface DayDetailDrawerProps {
  date: string | null; // YYYY-MM-DD
  items: CalendarItem[];
  timezone: string;
  onClose: () => void;
  onActionRequested: (target: SessionActionTarget) => void;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
}

function formatTimeInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
}

function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS_JA[new Date(y, m - 1, d).getDay()];
}

interface CalendarEventCardProps {
  event: CalendarEventItem;
  timezone: string;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
}

function CalendarEventCard({ event, timezone, onParticipationChanged }: CalendarEventCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const badge = CALENDAR_EVENT_TYPES[event.event_type];
  const isFuture = new Date(event.start_datetime) > new Date();

  const handleJoin = async () => {
    setIsSubmitting(true);
    try {
      const result = await joinCalendarEvent(event.calendar_event_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onParticipationChanged(event.calendar_event_id, true);
      showToast('参加登録しました', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    const ok = await showConfirm('参加をキャンセルしますか？', 'このイベントへの参加登録を取り消します。', { variant: 'danger' });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      const result = await cancelCalendarEventParticipation(event.calendar_event_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onParticipationChanged(event.calendar_event_id, false);
      showToast('参加をキャンセルしました', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!event.location_url) return;
    await navigator.clipboard.writeText(event.location_url);
    setCopied(true);
    showToast('リンクをコピーしました', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border', badge.badgeClass)}>
              {badge.label}
            </span>
            {event.rsvp_enabled && event.is_joined && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                <CheckCircle2 size={11} />
                参加済み
              </span>
            )}
          </div>
          <p className="text-sm font-black text-slate-800">{event.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {event.end_datetime
              ? `${formatTimeInZone(event.start_datetime, timezone)} - ${formatTimeInZone(event.end_datetime, timezone)}`
              : `${formatTimeInZone(event.start_datetime, timezone)}（開始日時のみ）`}
          </p>
        </div>
      </div>

      {event.description && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 whitespace-pre-wrap">{event.description}</p>
      )}

      {!event.rsvp_enabled && event.location_url && (
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

      {event.rsvp_enabled && !event.is_joined && isFuture && (
        <Button type="button" size="sm" onClick={handleJoin} disabled={isSubmitting} className="mt-1">
          {isSubmitting && <Loader2 size={13} className="animate-spin" />}
          参加する
        </Button>
      )}

      {event.rsvp_enabled && event.is_joined && (event.location_url || isFuture) && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            {event.location_url && (
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />
                  参加リンクを開く
                </a>
              </Button>
            )}
            {isFuture && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                キャンセル
              </Button>
            )}
          </div>

          {event.location_url && (
            <div>
              <button
                type="button"
                onClick={() => setShowLink((v) => !v)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                リンクを表示
              </button>
              {showLink && (
                <div className="flex items-center gap-2 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <span className="text-xs font-mono text-slate-600 truncate flex-1">{event.location_url}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                    title="コピー"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function DayDetailDrawer({ date, items, timezone, onClose, onActionRequested, onParticipationChanged }: DayDetailDrawerProps) {
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
                        <Button type="button" size="sm" variant="outline" onClick={() => onActionRequested({ session, mode: 'reschedule' })}>
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
