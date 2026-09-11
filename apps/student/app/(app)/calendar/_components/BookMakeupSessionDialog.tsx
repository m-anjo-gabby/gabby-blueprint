'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';
import { createSessionBookingRequest, checkSessionConflict } from '@/actions/sessionAction';
import { BookableTicketSlot } from '@gabby/types/matching';
import { SESSION_BOOKING_REQUEST_STATUS, SessionBookingRequest } from '@gabby/types/session';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';

// セッション枠は30分単位のため、時刻選択もこの粒度に揃える。担当コーチの対応可能時間に
// 縛られず自由に選べるようにするため、一日全体(00:00-23:59)を対象にする
// （コーチの承認を経ることで、実際に対応可能かどうかを確認してもらう設計）。
const TIME_OPTIONS = generateLessonStartTimeOptions('00:00', '23:59');

interface BookMakeupSessionDialogProps {
  open: boolean;
  slots: BookableTicketSlot[];
  initialDate?: string | null;
  onClose: () => void;
  onRequested: (request: SessionBookingRequest) => void;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function timeStrToMs(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return ((h * 60 + m) * 60 + (s ?? 0)) * 1000;
}

/**
 * 未消化のセッション（未割当／キャンセルで返還された枠）の新規予約リクエストダイアログ。
 * 週n回契約でコマごとに担当コーチが異なりうるため、コーチ選択はさせず対象のコマ(schedule_id)を
 * 選ばせる（コマの担当コーチは com_m_lesson_schedule.coach_id で既に確定している）。
 * 日時は担当コーチの対応可能時間に縛られず自由に選べるが、必ずコーチの承認を経て確定する。
 */
export function BookMakeupSessionDialog({ open, slots, initialDate, onClose, onRequested }: BookMakeupSessionDialogProps) {
  const currentUserId = useUserStore((state) => state.user?.id);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(slots[0]?.schedule_id ?? null);
  const [newDate, setNewDate] = useState(initialDate || tomorrowIsoDate());
  const [newStartTime, setNewStartTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setSelectedScheduleId(slots[0]?.schedule_id ?? null);
      setNewDate(initialDate || tomorrowIsoDate());
      setNewStartTime(null);
      setReason('');
      setConflictMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedSlot = slots.find((s) => s.schedule_id === selectedScheduleId) ?? null;

  const duration = useMemo(() => {
    if (!selectedSlot) return 0;
    return timeStrToMs(selectedSlot.end_time) - timeStrToMs(selectedSlot.start_time);
  }, [selectedSlot]);

  useEffect(() => {
    setConflictMessage(null);
    if (!selectedSlot || !newStartTime || !currentUserId || !duration) return;

    let cancelled = false;
    setIsChecking(true);
    const start = new Date(`${newDate}T${newStartTime}:00`);
    const end = new Date(start.getTime() + duration);
    checkSessionConflict(selectedSlot.coach_id, currentUserId, start.toISOString(), end.toISOString()).then((result) => {
      if (cancelled) return;
      setIsChecking(false);
      if (!result.success) return;
      setConflictMessage(
        result.coachConflict
          ? 'コーチが同じ時間帯に別のセッションの予定があります。'
          : result.studentConflict
            ? 'ご自身が同じ時間帯に別のセッションの予定があります。'
            : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSlot, newDate, newStartTime, currentUserId, duration]);

  const handleSubmit = async () => {
    if (!selectedSlot || !newStartTime || conflictMessage) return;
    setIsSubmitting(true);
    try {
      const start = new Date(`${newDate}T${newStartTime}:00`);
      const end = new Date(start.getTime() + duration);
      const result = await createSessionBookingRequest(selectedSlot.schedule_id, start.toISOString(), end.toISOString(), reason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('予約をリクエストしました。コーチの承認をお待ちください。', 'success');
      onRequested({
        request_id: result.requestId,
        schedule_id: selectedSlot.schedule_id,
        student_id: currentUserId ?? '',
        coach_id: selectedSlot.coach_id,
        requested_start_datetime: start.toISOString(),
        requested_end_datetime: end.toISOString(),
        reason: reason.trim() || null,
        status: SESSION_BOOKING_REQUEST_STATUS.PENDING,
        reject_reason: null,
        insert_date: new Date().toISOString(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>セッションを予約</DialogTitle>
          <DialogDescription>
            {selectedSlot
              ? `${selectedSlot.coach_name}コーチに、新しい日時での予約をリクエストします。承認されると確定します。`
              : '対象のコマを選択してください。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {slots.length > 1 && (
            <div className="space-y-1.5">
              <Label>対象のコマ</Label>
              <select
                value={selectedScheduleId ?? ''}
                onChange={(e) => {
                  setSelectedScheduleId(e.target.value);
                  setNewStartTime(null);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              >
                {slots.map((s) => (
                  <option key={s.schedule_id} value={s.schedule_id}>
                    {s.coach_name}コーチ（毎週{DAY_OF_WEEK_LABEL_JA[s.day_of_week]} {s.start_time.slice(0, 5)}〜／残り{s.shortfall}回分）
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>希望日</Label>
            <input
              type="date"
              min={tomorrowIsoDate()}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>希望開始時刻</Label>
            <select
              value={newStartTime ?? ''}
              onChange={(e) => setNewStartTime(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            >
              <option value="" disabled>
                時刻を選択
              </option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {isChecking && <p className="text-[11px] text-slate-400 mt-1">確認中…</p>}
            {conflictMessage && <p className="text-[11px] text-rose-600 mt-1">{conflictMessage}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>コーチへの一言（任意）</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：この時間帯でお願いできますか？" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            戻る
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !selectedSlot || !newStartTime || !!conflictMessage}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            リクエストする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
