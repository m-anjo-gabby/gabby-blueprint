'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Clock, CalendarClock } from 'lucide-react';
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
import {
  generateLessonStartTimeOptions,
  getLessonEndTime,
  doTimeRangesOverlap,
  convertWeeklyTimeZone,
  getFirstLiveSessionOccurrence,
  formatZonedDate,
} from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { CoachAvailabilityCalendar, AvailabilityCell } from './CoachAvailabilityCalendar';

interface RequestDialogProps {
  coach: CoachBrowseItem | null;
  ticketId: string;
  unmatchedSlots: SlotStatusItem[];
  onClose: () => void;
  onRequested: (slotNo: number, patch: Partial<SlotStatusItem>) => void;
}

export function RequestDialog({ coach, ticketId, unmatchedSlots, onClose, onRequested }: RequestDialogProps) {
  const studentTimezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [selectedSlotNo, setSelectedSlotNo] = useState<number | null>(unmatchedSlots[0]?.slot_no ?? null);
  const [selectedCell, setSelectedCell] = useState<AvailabilityCell | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  // ダイアログを開くたび（＝coachが変わるたび）に前回の選択をリセットする
  useEffect(() => {
    setSelectedCell(null);
    setSelectedSlotNo(unmatchedSlots[0]?.slot_no ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach?.user_id]);

  // コーチの対応可能時間ブロックを、25分レッスンの開始候補（30分刻み）に展開し、
  // それぞれ生徒のタイムゾーンでの表示曜日・時刻に変換してカレンダーのセルとする
  const cells = useMemo<AvailabilityCell[]>(() => {
    if (!coach) return [];
    const list: AvailabilityCell[] = [];
    for (const block of coach.availability) {
      const options = generateLessonStartTimeOptions(block.start_time, block.end_time);
      for (const t of options) {
        const display = convertWeeklyTimeZone(
          { day_of_week: block.day_of_week, start_time: t, end_time: getLessonEndTime(t) },
          coach.timezone,
          studentTimezone
        );
        list.push({
          key: `${block.day_of_week}-${t}`,
          sourceDay: block.day_of_week,
          sourceStartTime: t,
          displayDay: display.day_of_week as DayOfWeek,
          displayStartTime: display.start_time,
          displayEndTime: display.end_time,
        });
      }
    }
    return list;
  }, [coach, studentTimezone]);

  // 既に埋まっている（確定済み、または承認待ちの）曜日・時間帯と重なるセルを選択不可にする。
  // 判定はコーチのローカル時刻（sourceDay/sourceStartTime）ベースで行う
  // （coach.unavailable_slotsもcom_m_lesson_schedule/com_t_matching_request由来でコーチのローカル時刻）。
  // あくまでUI上のソフトチェックで、最終的な整合性はサーバー側(schedule_conflict)で担保する。
  const unavailableKeys = useMemo(() => {
    if (!coach) return new Set<string>();
    const keys = new Set<string>();
    for (const cell of cells) {
      const cellEndTime = getLessonEndTime(cell.sourceStartTime);
      const isBooked = coach.unavailable_slots.some((slot) =>
        slot.day_of_week === cell.sourceDay &&
        doTimeRangesOverlap(cell.sourceStartTime, cellEndTime, slot.start_time, slot.end_time)
      );
      if (isBooked) keys.add(cell.key);
    }
    return keys;
  }, [coach, cells]);

  const slotNo = selectedSlotNo ?? unmatchedSlots[0]?.slot_no ?? null;

  // 初回ライブセッション予定日: 当日を除き、現在時刻から実時間で24時間以上先となる直近の指定曜日・時刻
  // （タイムゾーン差により「翌日」が数時間後になるケースを避けるため、暦日ではなく絶対時刻で判定する）
  const firstSession = useMemo(() => {
    if (!coach || !selectedCell) return null;
    return getFirstLiveSessionOccurrence(
      selectedCell.sourceDay,
      selectedCell.sourceStartTime,
      coach.timezone,
      studentTimezone
    );
  }, [coach, selectedCell, studentTimezone]);

  const handleSubmit = async () => {
    if (!coach || !selectedCell || !slotNo) return;

    setIsSubmitting(true);
    try {
      const result = await createMatchingRequest({
        ticket_id: ticketId,
        coach_id: coach.user_id,
        slot_no: slotNo,
        day_of_week: selectedCell.sourceDay,
        start_time: selectedCell.sourceStartTime,
        end_time: getLessonEndTime(selectedCell.sourceStartTime),
      });

      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }

      onRequested(slotNo, {
        status: 'pending',
        coach_id: coach.user_id,
        coach_name: coach.user_name,
        day_of_week: selectedCell.sourceDay,
        start_time: `${selectedCell.sourceStartTime}:00`,
        end_time: `${getLessonEndTime(selectedCell.sourceStartTime)}:00`,
        coach_timezone: coach.timezone,
      });
      showToast('リクエストを送信しました。コーチの承認をお待ちください。', 'success');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!coach} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {coach && (
          <>
            <DialogHeader>
              <DialogTitle>{coach.user_name} にリクエスト</DialogTitle>
              <DialogDescription>
                カレンダーから希望のレッスン開始時刻を選択してください（1レッスン25分）。時刻はあなたのタイムゾーンで表示しています。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <CoachAvailabilityCalendar
                cells={cells}
                unavailableKeys={unavailableKeys}
                selectedKey={selectedCell?.key ?? null}
                onSelect={setSelectedCell}
              />
              <p className="text-[11px] text-slate-400">〇は申請可能、×は受付終了です。</p>

              {selectedCell && (
                <div className="space-y-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
                    <Clock size={14} />
                    毎週 {DAY_OF_WEEK_LABEL_JA[selectedCell.displayDay]} {selectedCell.displayStartTime} - {selectedCell.displayEndTime}
                  </div>
                  {firstSession && (
                    <div className="flex items-center gap-2 border-t border-indigo-100 pt-1.5 text-xs font-bold text-indigo-700">
                      <CalendarClock size={14} />
                      初回ライブセッション予定日: {formatZonedDate(firstSession.instant, studentTimezone)}（
                      {DAY_OF_WEEK_LABEL_JA[firstSession.day_of_week as DayOfWeek]}）{firstSession.start_time}〜
                    </div>
                  )}
                </div>
              )}

              {unmatchedSlots.length > 1 && (
                <div className="space-y-1.5">
                  <Label>リクエストするコマ</Label>
                  <select
                    value={slotNo ?? ''}
                    onChange={(e) => setSelectedSlotNo(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                  >
                    {unmatchedSlots.map((s) => (
                      <option key={s.slot_no} value={s.slot_no}>
                        {s.slot_no}コマ目
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !selectedCell || !slotNo}>
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
