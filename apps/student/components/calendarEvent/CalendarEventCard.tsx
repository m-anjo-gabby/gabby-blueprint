'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Download, ExternalLink, Megaphone, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useToast } from '@gabby/lib/hooks/useToast';
import {
  CalendarEventItem,
  CalendarEventMessageItem,
  CALENDAR_EVENT_TYPES,
  getCalendarEventPhase,
} from '@gabby/types/calendarEvent';
import { getCalendarEventMessages, getCalendarEventMessageAttachmentUrl } from '@/actions/calendarEventAction';
import { AddToCalendarMenu } from './AddToCalendarMenu';
import { useEventParticipation } from './useEventParticipation';
import { EventCoachLine, EventSeriesLabel } from './EventMeta';

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatEventTimeInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
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
    <div className="space-y-2 pt-2 border-t border-line/70">
      <p className="text-[11px] font-bold text-ink-subtle flex items-center gap-1.5">
        <Megaphone size={11} /> アナウンス
      </p>
      {messages.map((message) => (
        <div key={message.calendar_event_message_id} className="bg-brand-soft/50 border border-brand-100 rounded-xl p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-ink">{message.title}</p>
            <p className="text-[11px] text-ink-subtle font-bold shrink-0">{formatDateTimeByZone(message.insert_date, timezone, false)}</p>
          </div>
          <p className="text-xs text-ink-soft whitespace-pre-wrap">{message.content}</p>
          {message.attachments.length > 0 && (
            <div className="space-y-1 pt-1">
              {message.attachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => handleDownload(att.path)}
                  className="w-full flex items-center justify-between gap-2 p-2 bg-surface rounded-lg border border-line/70 hover:border-brand-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Paperclip size={12} className="text-ink-subtle shrink-0" />
                    <span className="text-[11px] font-bold text-ink-soft truncate">{att.name}</span>
                    <span className="text-[11px] text-ink-subtle tabular-nums shrink-0">{formatAttachmentSize(att.size)}</span>
                  </div>
                  <Download size={12} className="text-ink-subtle shrink-0" />
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

/**
 * カレンダーイベント（グループセッション・メンテナンス等）の詳細（カレンダーの日の詳細・ホームのイベント詳細で共有する）。
 * 参加確認ありのイベントは、参加登録した人にだけ参加URLを出す。参加登録は終了するまで、取消は開始前まで受け付ける。
 */
export function CalendarEventCard({ event, timezone, onParticipationChanged }: CalendarEventCardProps) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const nowMs = useNow();
  const { showToast } = useToast();
  const { join, cancel, isSubmitting } = useEventParticipation(onParticipationChanged);

  const badge = CALENDAR_EVENT_TYPES[event.event_type];
  const phase = nowMs === null ? 'upcoming' : getCalendarEventPhase(event, nowMs);
  const isFuture = phase === 'upcoming';
  const isOpen = phase !== 'ended';

  const handleCopy = async () => {
    if (!event.location_url) return;
    await navigator.clipboard.writeText(event.location_url);
    setCopied(true);
    showToast('リンクをコピーしました', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="bg-surface rounded-2xl border border-line/70 shadow-sm p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('text-[11px] font-bold px-2 py-1 rounded-md border', badge.badgeClass)}>{badge.label}</span>
            {event.rsvp_enabled && event.is_joined && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                <CheckCircle2 size={11} />
                参加予定
              </span>
            )}
          </div>
          <EventSeriesLabel event={event} />
          <p className="text-sm font-bold text-ink">{event.title}</p>
          <p className="text-xs text-ink-muted mt-0.5">
            {event.end_datetime
              ? `${formatEventTimeInZone(event.start_datetime, timezone)} - ${formatEventTimeInZone(event.end_datetime, timezone)}`
              : `${formatEventTimeInZone(event.start_datetime, timezone)}（開始日時のみ）`}
          </p>
          <EventCoachLine event={event} className="mt-0.5" />
        </div>
      </div>

      {event.description && (
        <p className="text-xs text-ink-soft bg-canvas border border-line/70 rounded-lg px-3 py-2 whitespace-pre-wrap">{event.description}</p>
      )}

      {/* シリーズの説明（企画の紹介・月のテーマ等）。各回の説明の下に添える */}
      {event.series?.description && (
        <div className="rounded-lg border border-line/70 px-3 py-2">
          <p className="text-[11px] font-bold text-ink-subtle">{event.series.title}について</p>
          <p className="mt-0.5 text-xs text-ink-soft whitespace-pre-wrap">{event.series.description}</p>
        </div>
      )}

      {!event.rsvp_enabled && event.location_url && (
        <a
          href={event.location_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:text-brand-strong"
        >
          <ExternalLink size={13} />
          参加リンクを開く
        </a>
      )}

      {event.rsvp_enabled && !event.is_joined && isOpen && (
        <div className="space-y-1 pt-1">
          <Button pending={isSubmitting} type="button" size="sm" onClick={() => join(event.calendar_event_id)}>
            参加予定にする
          </Button>
          <p className="text-[11px] text-ink-muted">参加予定にすると、参加用のリンクが表示されます。</p>
        </div>
      )}

      {event.rsvp_enabled && event.is_joined && isOpen && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {event.location_url && (
              <Button type="button" size="sm" asChild>
                <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />
                  参加する
                </a>
              </Button>
            )}
            <AddToCalendarMenu event={event} />
            {isFuture && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => cancel(event.calendar_event_id)}
                pending={isSubmitting}
                icon={<X size={13} />}
              >
                キャンセル
              </Button>
            )}
          </div>

          {event.location_url ? (
            <div>
              <button
                type="button"
                onClick={() => setShowLink((v) => !v)}
                className="text-xs font-bold text-ink-subtle hover:text-ink-soft transition-colors"
              >
                リンクを表示
              </button>
              {showLink && (
                <div className="flex items-center gap-2 mt-1.5 bg-canvas border border-line/70 rounded-lg px-3 py-2">
                  <span className="text-xs tabular-nums text-ink-soft truncate flex-1">{event.location_url}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 text-ink-subtle hover:text-ink-soft transition-colors"
                    title="コピー"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-ink-muted">参加用のリンクは決まり次第ここに表示されます。</p>
          )}
        </div>
      )}

      <CalendarEventAnnouncements calendarEventId={event.calendar_event_id} timezone={timezone} />
    </article>
  );
}
