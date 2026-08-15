'use client';

import { useMemo, useState } from 'react';
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
import { createMatchingRequest } from '@/actions/matchingAction';
import { CoachBrowseItem, SlotStatusItem } from '@gabby/types/matching';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { generateLessonStartTimeOptions, getLessonEndTime } from '@gabby/lib/date/date';

interface RequestDialogTarget {
  coach: CoachBrowseItem;
  dayOfWeek: DayOfWeek;
  blockStartTime: string;
  blockEndTime: string;
}

interface RequestDialogProps {
  target: RequestDialogTarget | null;
  ticketId: string;
  unmatchedSlots: SlotStatusItem[];
  onClose: () => void;
  onRequested: (slotNo: number, patch: Partial<SlotStatusItem>) => void;
}

export function RequestDialog({ target, ticketId, unmatchedSlots, onClose, onRequested }: RequestDialogProps) {
  const [selectedSlotNo, setSelectedSlotNo] = useState<number | null>(unmatchedSlots[0]?.slot_no ?? null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const startTimeOptions = useMemo(
    () => (target ? generateLessonStartTimeOptions(target.blockStartTime, target.blockEndTime) : []),
    [target]
  );

  const startTime = selectedStartTime ?? startTimeOptions[0] ?? null;
  const slotNo = selectedSlotNo ?? unmatchedSlots[0]?.slot_no ?? null;

  const handleSubmit = async () => {
    if (!target || !startTime || !slotNo) return;

    setIsSubmitting(true);
    try {
      const result = await createMatchingRequest({
        ticket_id: ticketId,
        coach_id: target.coach.user_id,
        slot_no: slotNo,
        day_of_week: target.dayOfWeek,
        start_time: startTime,
        end_time: getLessonEndTime(startTime),
      });

      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }

      onRequested(slotNo, {
        status: 'pending',
        coach_id: target.coach.user_id,
        coach_name: target.coach.user_name,
        day_of_week: target.dayOfWeek,
        start_time: `${startTime}:00`,
        end_time: `${getLessonEndTime(startTime)}:00`,
      });
      showToast('リクエストを送信しました。コーチの承認をお待ちください。', 'success');
      onClose();
    } finally {
      setIsSubmitting(false);
      setSelectedStartTime(null);
      setSelectedSlotNo(null);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && (
          <>
            <DialogHeader>
              <DialogTitle>{target.coach.user_name} にリクエスト</DialogTitle>
              <DialogDescription>
                {DAY_OF_WEEK_LABEL_JA[target.dayOfWeek]}の対応可能時間から、レッスン開始時刻を選択してください（1レッスン25分）。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {unmatchedSlots.length > 1 && (
                <div className="space-y-1.5">
                  <Label>対象の枠</Label>
                  <select
                    value={slotNo ?? ''}
                    onChange={(e) => setSelectedSlotNo(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                  >
                    {unmatchedSlots.map((s) => (
                      <option key={s.slot_no} value={s.slot_no}>
                        枠{s.slot_no}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>レッスン開始時刻</Label>
                {startTimeOptions.length === 0 ? (
                  <p className="text-xs text-rose-600">この時間帯では25分のレッスン枠を確保できません。</p>
                ) : (
                  <select
                    value={startTime ?? ''}
                    onChange={(e) => setSelectedStartTime(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                  >
                    {startTimeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t} - {getLessonEndTime(t)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !startTime || !slotNo}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                リクエストを送信
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
