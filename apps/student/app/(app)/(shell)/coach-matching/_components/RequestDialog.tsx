'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, CalendarClock, TriangleAlert } from 'lucide-react';
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
import { createMatchingRequest, getMatchingSlotOptions } from '@/actions/matchingAction';
import { CoachBrowseItem, MatchingSlotOption, SlotStatusItem, getMatchingUnbookedBreakdown } from '@gabby/types/matching';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import {
  generateLessonStartTimeOptions,
  getLessonEndTime,
  convertWeeklyTimeZone,
  getFirstLiveSessionOccurrence,
  formatZonedDate,
} from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { CoachAvailabilityCalendar, AvailabilityCell, AvailabilityCellState } from './CoachAvailabilityCalendar';

interface RequestDialogProps {
  coach: CoachBrowseItem | null;
  ticketId: string;
  /** 契約（ライセンス）の開始日時。開始前の契約で申請する場合、初回の予定日はこれ以降になる */
  contractStartDate: string;
  unmatchedSlots: SlotStatusItem[];
  onClose: () => void;
  onRequested: (slotNo: number, patch: Partial<SlotStatusItem>) => void;
}

function optionKey(day: DayOfWeek, startTime: string): string {
  return `${day}-${startTime}`;
}

function toCellState(option: MatchingSlotOption | undefined): AvailabilityCellState {
  if (!option || !option.is_acceptable) return 'unavailable';
  return option.bookable_sessions >= option.target_sessions ? 'full' : 'partial';
}

export function RequestDialog({ coach, ticketId, contractStartDate, unmatchedSlots, onClose, onRequested }: RequestDialogProps) {
  const studentTimezone = useTimezone();
  const [selectedSlotNo, setSelectedSlotNo] = useState<number | null>(unmatchedSlots[0]?.slot_no ?? null);
  const [selectedCell, setSelectedCell] = useState<AvailabilityCell | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 候補ごとの予約できる回数。取得のたびに対象（コーチ×コマ）のkeyと組で持ち、対象が変わったら取得中として扱う
  const [loadedOptions, setLoadedOptions] = useState<{ key: string; options: Map<string, MatchingSlotOption> } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const { showToast } = useToast();

  // ダイアログを開くたび（＝coachが変わるたび）に前回の選択をリセットする
  useEffect(() => {
    setSelectedCell(null);
    setSelectedSlotNo(unmatchedSlots[0]?.slot_no ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach?.user_id]);

  // コーチの対応可能時間ブロック（UTC）を、25分セッションの開始候補（30分刻み）に展開し、
  // それぞれ生徒のタイムゾーンでの表示曜日・時刻に変換してカレンダーのセルとする
  const cells = useMemo<AvailabilityCell[]>(() => {
    if (!coach) return [];
    const list: AvailabilityCell[] = [];
    for (const block of coach.availability) {
      const options = generateLessonStartTimeOptions(block.start_time, block.end_time);
      for (const t of options) {
        const display = convertWeeklyTimeZone(
          { day_of_week: block.day_of_week, start_time: t, end_time: getLessonEndTime(t) },
          'UTC',
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

  const slotNo = selectedSlotNo ?? unmatchedSlots[0]?.slot_no ?? null;
  const optionsTargetKey = coach && slotNo ? `${coach.user_id}:${slotNo}` : null;

  // 候補ごとに、契約期間内に予約できる回数をサーバーで数える（コーチの他の生徒の予定・承認待ちのリクエスト・休み、
  // 自分の他の予定と重なる回は予約できない）。ダイアログを開いた・コマを切り替えた操作に応じた取得で、画面の初期表示には使わない。
  useEffect(() => {
    if (!coach || !slotNo || !optionsTargetKey) return;
    let cancelled = false;
    const candidates = Array.from(
      new Map(cells.map((c) => [optionKey(c.displayDay, c.displayStartTime), { day_of_week: c.displayDay, start_time: c.displayStartTime }])).values()
    );
    void getMatchingSlotOptions(ticketId, coach.user_id, slotNo, candidates).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        showToast(result.message, 'error');
        setLoadedOptions({ key: optionsTargetKey, options: new Map() });
        return;
      }
      setLoadedOptions({
        key: optionsTargetKey,
        options: new Map(result.options.map((o) => [optionKey(o.day_of_week, o.start_time), o])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [coach, slotNo, optionsTargetKey, cells, ticketId, showToast]);

  const slotOptions = loadedOptions && loadedOptions.key === optionsTargetKey ? loadedOptions.options : null;

  const cellStates = useMemo(() => {
    if (!slotOptions) return null;
    return new Map(cells.map((c) => [c.key, toCellState(slotOptions.get(optionKey(c.displayDay, c.displayStartTime)))]));
  }, [cells, slotOptions]);

  const selectedOption = selectedCell && slotOptions ? slotOptions.get(optionKey(selectedCell.displayDay, selectedCell.displayStartTime)) : undefined;
  const selectedState = toCellState(selectedOption);
  const breakdown = selectedOption ? getMatchingUnbookedBreakdown(selectedOption) : null;
  const needsAcknowledgement = selectedState === 'partial';

  // 選んだ枠・コマが変わったら、個別調整の了承をやり直す。取得し直した結果、選んだ枠が申請できなくなったら選択を外す
  useEffect(() => {
    setAcknowledged(false);
  }, [selectedCell?.key, slotNo]);
  useEffect(() => {
    if (selectedCell && cellStates && cellStates.get(selectedCell.key) === 'unavailable') setSelectedCell(null);
  }, [cellStates, selectedCell]);

  // 初回ライブセッション予定日: 当日を除き、現在時刻から実時間で24時間以上先、かつ契約の開始日時以降となる直近の指定曜日・時刻
  // （タイムゾーン差により「翌日」が数時間後になるケースを避けるため、暦日ではなく絶対時刻で判定する）
  // ※初回の回がコーチの他の予定と重なる場合は、実際の初回はその次の予約できる回になる
  const firstSession = useMemo(() => {
    if (!coach || !selectedCell) return null;
    return getFirstLiveSessionOccurrence(
      selectedCell.displayDay,
      selectedCell.displayStartTime,
      studentTimezone,
      studentTimezone,
      undefined,
      new Date(contractStartDate)
    );
  }, [coach, selectedCell, studentTimezone, contractStartDate]);

  const handleSubmit = async () => {
    if (!coach || !selectedCell || !slotNo) return;

    setIsSubmitting(true);
    try {
      const result = await createMatchingRequest({
        ticket_id: ticketId,
        coach_id: coach.user_id,
        slot_no: slotNo,
        day_of_week: selectedCell.displayDay,
        start_time: selectedCell.displayStartTime,
        end_time: getLessonEndTime(selectedCell.displayStartTime),
      });

      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }

      onRequested(slotNo, {
        status: 'pending',
        coach_id: coach.user_id,
        coach_name: coach.user_name,
        day_of_week: selectedCell.displayDay,
        start_time: `${selectedCell.displayStartTime}:00`,
        end_time: `${getLessonEndTime(selectedCell.displayStartTime)}:00`,
        schedule_timezone: studentTimezone,
        request_id: result.requestId,
        expires_at: result.expiresAt,
        reject_reason: null,
        last_request_expired: false,
      });
      showToast('リクエストを送信しました。24時間以内にコーチが回答します。', 'success');
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
                カレンダーから希望のセッション開始時刻を選択してください（1セッション25分）。時刻はあなたのタイムゾーンで表示しています。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <CoachAvailabilityCalendar
                cells={cells}
                cellStates={cellStates}
                selectedKey={selectedCell?.key ?? null}
                onSelect={setSelectedCell}
              />
              <p className="text-[11px] text-ink-subtle">
                〇は契約期間内の全ての回を予約できます。△は一部の回がコーチの他の予定と重なるため、その回はコーチと個別に日時を調整します。×は受付終了（他の予定や他の方のリクエストと重なる回が多い）です。
              </p>

              {selectedCell && (
                <div className="space-y-1.5 rounded-control border border-brand-100 bg-brand-soft px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-brand-strong">
                    <Clock size={14} />
                    毎週 {DAY_OF_WEEK_LABEL_JA[selectedCell.displayDay]} {selectedCell.displayStartTime} - {selectedCell.displayEndTime}
                  </div>
                  {firstSession && (
                    <div className="flex items-center gap-2 border-t border-brand-100 pt-1.5 text-xs font-bold text-brand-strong">
                      <CalendarClock size={14} />
                      初回ライブセッション予定日: {formatZonedDate(firstSession.instant, studentTimezone)}（
                      {DAY_OF_WEEK_LABEL_JA[firstSession.day_of_week as DayOfWeek]}）{firstSession.start_time}〜
                    </div>
                  )}
                  {selectedOption && breakdown && (
                    <p className="border-t border-brand-100 pt-1.5 text-xs text-brand-strong">
                      このコマの{selectedOption.target_sessions}回のうち、{selectedOption.bookable_sessions}回を予約します。
                      {breakdown.unbooked > 0 && `残り${breakdown.unbooked}回は未予約になります。`}
                    </p>
                  )}
                </div>
              )}

              {selectedOption && breakdown && breakdown.unbooked > 0 && (
                <div className="space-y-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <p className="flex items-center gap-1.5 font-bold">
                    <TriangleAlert size={14} aria-hidden="true" />
                    未予約の{breakdown.unbooked}回は、コーチと個別に日時を調整してください
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {breakdown.conflicts > 0 && <li>コーチの他の予定（他の方のリクエストを含む）やあなたの他の予定と重なる回: {breakdown.conflicts}回</li>}
                    {breakdown.periodShort > 0 && <li>契約の残り期間に入りきらない回: {breakdown.periodShort}回</li>}
                  </ul>
                  <p>マッチング成立後、ライブセッションのページから未予約の回の日時をリクエストできます。</p>
                  {needsAcknowledgement && (
                    <label className="flex items-center gap-2 pt-0.5 font-bold">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      未予約の回を個別に調整することを了承しました
                    </label>
                  )}
                </div>
              )}

              <p className="text-[11px] text-ink-subtle">
                コーチは24時間以内に回答します。期限までに回答が無い場合、リクエストは無効になり、別のコーチや時間帯でリクエストし直せます。
              </p>

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
              <Button
                pending={isSubmitting}
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedCell || !slotNo || !selectedOption || (needsAcknowledgement && !acknowledged)}
              >
                リクエストを送信
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
