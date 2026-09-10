'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';
import { bookMakeupSession } from '@/actions/sessionAction';
import { BookableTicketSlot } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';

interface BookMakeupSessionDialogProps {
  open: boolean;
  slots: BookableTicketSlot[];
  initialDate?: string | null;
  onClose: () => void;
  onBooked: () => void;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function localDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * 未割当チケット（キャンセルによりticket_refunded=trueとなり返還された枠）の予約ダイアログ。
 * 週n回契約でコマごとに担当コーチが異なりうるため、コーチ選択はさせず対象のコマ(schedule_id)を
 * 選ばせる（コマの担当コーチは com_m_lesson_schedule.coach_id で既に確定している）。
 */
export function BookMakeupSessionDialog({ open, slots, initialDate, onClose, onBooked }: BookMakeupSessionDialogProps) {
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(slots[0]?.schedule_id ?? null);
  const [newDate, setNewDate] = useState(initialDate || tomorrowIsoDate());
  const [newStartTime, setNewStartTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setSelectedScheduleId(slots[0]?.schedule_id ?? null);
      setNewDate(initialDate || tomorrowIsoDate());
      setNewStartTime(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedSlot = slots.find((s) => s.schedule_id === selectedScheduleId) ?? null;

  const startTimeOptions = useMemo(() => {
    if (!selectedSlot) return [];
    const dow = localDayOfWeek(newDate);
    return selectedSlot.availability
      .filter((a) => a.day_of_week === dow)
      .flatMap((a) => generateLessonStartTimeOptions(a.start_time, a.end_time));
  }, [selectedSlot, newDate]);

  const handleSubmit = async () => {
    if (!selectedSlot || !newStartTime) return;
    setIsSubmitting(true);
    try {
      const result = await bookMakeupSession(selectedSlot.schedule_id, newDate, newStartTime);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('予約が完了しました。カレンダーが更新されます。', 'success');
      onBooked();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>未割当のチケットを予約</DialogTitle>
          <DialogDescription>
            {selectedSlot
              ? `${selectedSlot.coach_name}コーチの対応可能時間内で、新しい日時を選択してください。`
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
            <Label>新しい日付</Label>
            <input
              type="date"
              min={tomorrowIsoDate()}
              value={newDate}
              onChange={(e) => {
                setNewDate(e.target.value);
                setNewStartTime(null);
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>開始時刻</Label>
            {startTimeOptions.length === 0 ? (
              <p className="text-xs text-rose-600">この日はコーチの対応可能時間がありません。</p>
            ) : (
              <select
                value={newStartTime ?? ''}
                onChange={(e) => setNewStartTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              >
                <option value="" disabled>
                  時刻を選択
                </option>
                {startTimeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            戻る
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !selectedSlot || !newStartTime}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            予約する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
