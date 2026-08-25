'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Check, CalendarClock, CheckCircle2, Copy, ExternalLink, Loader2, Megaphone, Paperclip, Download, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { SESSION_STATUS } from '@gabby/types/session';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { CalendarEventItem, CalendarEventMessageItem, CALENDAR_EVENT_TYPES } from '@gabby/types/calendarEvent';
import { CALENDAR_EVENT_TYPE_LABEL_EN } from '@/constants/calendarEvent';
import { CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import {
  joinCalendarEvent,
  cancelCalendarEventParticipation,
  getCalendarEventMessages,
  getCalendarEventMessageAttachmentUrl,
} from '@/actions/calendarEventAction';
import { SessionActionTarget } from './SessionActionDialog';

interface DayDetailDrawerProps {
  date: string | null; // YYYY-MM-DD
  items: CalendarItem[];
  timezone: string;
  onClose: () => void;
  onActionRequested: (target: SessionActionTarget) => void;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
}

function formatTimeInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
}

function formatDateTimeInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'EEEE, MMMM d, yyyy');
}

function CalendarEventAnnouncements({ calendarEventId, timezone }: { calendarEventId: string; timezone: string }) {
  const [messages, setMessages] = useState<CalendarEventMessageItem[]>([]);

  useEffect(() => {
    getCalendarEventMessages(calendarEventId).then(setMessages);
  }, [calendarEventId]);

  const handleDownload = async (path: string) => {
    const { url } = await getCalendarEventMessageAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (messages.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Megaphone size={11} /> Announcements
      </p>
      {messages.map((message) => (
        <div key={message.calendar_event_message_id} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-black text-slate-800">{message.title}</p>
            <p className="text-[10px] text-slate-400 font-bold shrink-0">{formatDateTimeInZone(message.insert_date, timezone)}</p>
          </div>
          <p className="text-xs text-slate-600 whitespace-pre-wrap">{message.content}</p>
          {message.attachments.length > 0 && (
            <div className="space-y-1 pt-1">
              {message.attachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => handleDownload(att.path)}
                  className="w-full flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-100 hover:border-indigo-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Paperclip size={12} className="text-slate-400 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-700 truncate">{att.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">{formatAttachmentSize(att.size)}</span>
                  </div>
                  <Download size={12} className="text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
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
  const label = CALENDAR_EVENT_TYPE_LABEL_EN[event.event_type];
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
      showToast('You have joined this event.', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    const ok = await showConfirm('Cancel participation?', 'This will remove your registration for this event.', {
      variant: 'danger',
      confirmText: 'Cancel Participation',
      cancelText: 'Back',
    });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      const result = await cancelCalendarEventParticipation(event.calendar_event_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onParticipationChanged(event.calendar_event_id, false);
      showToast('Your participation has been cancelled.', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!event.location_url) return;
    await navigator.clipboard.writeText(event.location_url);
    setCopied(true);
    showToast('Link copied.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border', badge.badgeClass)}>{label}</span>
            {event.is_assigned_coach && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1">
                <CheckCircle2 size={11} />
                You&apos;re the coach
              </span>
            )}
            {!event.is_assigned_coach && event.rsvp_enabled && event.is_joined && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                <CheckCircle2 size={11} />
                Joined
              </span>
            )}
          </div>
          <p className="text-sm font-black text-slate-800">{event.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {event.end_datetime
              ? `${formatTimeInZone(event.start_datetime, timezone)} - ${formatTimeInZone(event.end_datetime, timezone)}`
              : `${formatTimeInZone(event.start_datetime, timezone)} (start time only)`}
          </p>
        </div>
      </div>

      {event.description && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 whitespace-pre-wrap">{event.description}</p>
      )}

      {(!event.rsvp_enabled || event.is_assigned_coach) && event.location_url && (
        <a
          href={event.location_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
        >
          <ExternalLink size={13} />
          Open event link
        </a>
      )}

      {event.rsvp_enabled && !event.is_assigned_coach && !event.is_joined && isFuture && (
        <Button type="button" size="sm" onClick={handleJoin} disabled={isSubmitting} className="mt-1">
          {isSubmitting && <Loader2 size={13} className="animate-spin" />}
          Join
        </Button>
      )}

      {event.rsvp_enabled && !event.is_assigned_coach && event.is_joined && (event.location_url || isFuture) && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            {event.location_url && (
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />
                  Open event link
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
                Cancel
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
                Show link
              </button>
              {showLink && (
                <div className="flex items-center gap-2 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <span className="text-xs font-mono text-slate-600 truncate flex-1">{event.location_url}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CalendarEventAnnouncements calendarEventId={event.calendar_event_id} timezone={timezone} />
    </article>
  );
}

export function DayDetailDrawer({ date, items, timezone, onClose, onActionRequested, onParticipationChanged }: DayDetailDrawerProps) {
  const sorted = items.slice().sort((a, b) => a.data.start_datetime.localeCompare(b.data.start_datetime));

  return (
    <Drawer open={!!date} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-w-2xl mx-auto max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base font-black text-slate-800">{date ? formatDayHeading(date) : ''}</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto space-y-3">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarClock size={20} className="text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-500">No events on this day</p>
            </div>
          ) : (
            sorted.map((item) => {
              if (item.kind === 'session') {
                const session = item.data;
                const badge = SESSION_STATUS_BADGE[session.status];
                const isFuture = new Date(session.start_datetime) > new Date();
                const canAct = session.status === SESSION_STATUS.SCHEDULED && isFuture;
                return (
                  <article key={getCalendarItemKey(item)} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-800">
                          {formatTimeInZone(session.start_datetime, timezone)} - {formatTimeInZone(session.end_datetime, timezone)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{session.counterpart_name}</p>
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
                          Reschedule
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => onActionRequested({ session, mode: 'cancel' })}
                        >
                          <X size={13} />
                          Cancel
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
