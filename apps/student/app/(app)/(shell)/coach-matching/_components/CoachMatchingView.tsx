'use client';

import { useMemo, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Users, X } from 'lucide-react';
import { CoachCard, CoachSlotRelation } from './CoachCard';
import { CoachSearchFilters } from './CoachSearchFilters';
import { RequestDialog } from './RequestDialog';
import { cancelMatchingRequest } from '@/actions/matchingAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { CoachBrowseItem, SlotStatusItem } from '@gabby/types/matching';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { CountryMaster } from '@gabby/types/country';
import { LiveSessionTicketSummary } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_JA, slotMatchesFilter } from '@/constants/matching';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { convertWeeklyTimeZone } from '@gabby/lib/date/date';
import { ShellPageHeader, ShellSectionTitle } from '@/components/shell/ShellPage';
import { Button } from '@/components/ui/button';

interface CoachMatchingViewProps {
  ticket: LiveSessionTicketSummary;
  initialSlots: SlotStatusItem[];
  coaches: CoachBrowseItem[];
  countries: CountryMaster[];
}

const STATUS_BADGE: Record<SlotStatusItem['status'], { label: string; className: string }> = {
  matched: { label: 'マッチング済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: '承認待ち', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  unmatched: { label: '未マッチング', className: 'bg-canvas text-ink-soft border-line' },
};

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

export function CoachMatchingView({ ticket, initialSlots, coaches, countries }: CoachMatchingViewProps) {
  const studentTimezone = useTimezone();
  const [slots, setSlots] = useState<SlotStatusItem[]>(initialSlots);
  const [cancellingSlotNo, setCancellingSlotNo] = useState<number | null>(null);
  const [isCancelling, startCancelTransition] = useTransition();
  const [requestTarget, setRequestTarget] = useState<CoachBrowseItem | null>(null);

  // --- コーチ検索フィルター（コーチ名・曜日・大まかな時間帯） ---
  const [selectedDays, setSelectedDays] = useState<Set<DayOfWeek>>(new Set());
  const [selectedTimeBuckets, setSelectedTimeBuckets] = useState<Set<string>>(new Set());
  const [nameQuery, setNameQuery] = useState('');

  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const unmatchedSlots = slots.filter((s) => s.status === 'unmatched');

  const hasFilter = selectedDays.size > 0 || selectedTimeBuckets.size > 0 || nameQuery.trim() !== '';

  // 曜日・時間帯で絞り込み中は、条件に一致する枠が多いコーチを上に並べる（同数なら元の並び順を保つ）
  const filteredCoaches = useMemo(() => {
    const trimmedQuery = nameQuery.trim().toLowerCase();
    const hasSlotFilter = selectedDays.size > 0 || selectedTimeBuckets.size > 0;

    const matched = coaches.flatMap((coach) => {
      if (trimmedQuery && !coach.user_name.toLowerCase().includes(trimmedQuery)) return [];
      if (!hasSlotFilter) return [{ coach, matchCount: 0 }];

      const matchCount = coach.availability.filter((slot) => {
        const display = convertWeeklyTimeZone(slot, coach.timezone, studentTimezone);
        return slotMatchesFilter(
          display.day_of_week as DayOfWeek,
          display.start_time,
          display.end_time,
          selectedDays,
          selectedTimeBuckets
        );
      }).length;
      return matchCount > 0 ? [{ coach, matchCount }] : [];
    });

    if (hasSlotFilter) matched.sort((a, b) => b.matchCount - a.matchCount);
    return matched.map(({ coach }) => coach);
  }, [coaches, selectedDays, selectedTimeBuckets, nameQuery, studentTimezone]);

  // コーチごとの自分の枠の状況（承認待ち・担当中）。カード上で重複リクエストに気付けるようにする
  const slotRelationsByCoach = useMemo(() => {
    const map = new Map<string, CoachSlotRelation[]>();
    for (const slot of slots) {
      if (slot.status === 'unmatched' || !slot.coach_id) continue;
      const list = map.get(slot.coach_id) ?? [];
      list.push({ slotNo: slot.slot_no, status: slot.status });
      map.set(slot.coach_id, list);
    }
    return map;
  }, [slots]);

  const handleToggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleToggleTimeBucket = (key: string) => {
    setSelectedTimeBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleClearFilter = () => {
    setSelectedDays(new Set());
    setSelectedTimeBuckets(new Set());
    setNameQuery('');
  };

  const handleSlotUpdate = (slotNo: number, patch: Partial<SlotStatusItem>) => {
    setSlots((prev) => prev.map((s) => (s.slot_no === slotNo ? { ...s, ...patch } : s)));
  };

  const handleCancel = async (slot: SlotStatusItem) => {
    if (!slot.request_id) return;
    const ok = await showConfirm('リクエストを取消しますか？', 'このリクエストを取消して、別のコーチに送り直すことができます。', {
      variant: 'danger',
    });
    if (!ok) return;

    const requestId = slot.request_id;
    setCancellingSlotNo(slot.slot_no);
    startCancelTransition(async () => {
      const result = await cancelMatchingRequest(requestId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      handleSlotUpdate(slot.slot_no, {
        status: 'unmatched',
        coach_id: null,
        coach_name: null,
        day_of_week: null,
        start_time: null,
        end_time: null,
        request_id: null,
        reject_reason: null,
      });
      showToast('リクエストを取消しました', 'success');
    });
  };

  return (
    <>
      <ShellPageHeader
        title="専属コーチを探す"
        back="/live-room"
        description={`週${ticket.weekly_frequency}回のセッション枠ごとにコーチをリクエストできます。コーチが承認すると、契約期間分のセッションが自動で予約されます。`}
      />

      {/* 2. コンテンツエリア（スクロール） */}
      <div className="space-y-6">
        <section>
          <ShellSectionTitle>セッション枠の状況</ShellSectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => {
              const badge = STATUS_BADGE[slot.status];
              return (
                <div key={slot.slot_no} className="bg-surface rounded-card border border-line/70 shadow-sm p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-ink-soft">{slot.slot_no}コマ目</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  {slot.coach_name && slot.day_of_week !== null && slot.start_time && slot.end_time && (() => {
                    const display = convertWeeklyTimeZone(
                      { day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.end_time },
                      slot.coach_timezone || 'Asia/Tokyo',
                      studentTimezone
                    );
                    return (
                      <p className="text-xs text-ink-soft">
                        {slot.coach_name} ・ {DAY_OF_WEEK_LABEL_JA[display.day_of_week as DayOfWeek]}{' '}
                        {formatTimeRange(display.start_time, display.end_time)}
                      </p>
                    );
                  })()}

                  {slot.status === 'unmatched' && slot.reject_reason && (
                    <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-control px-2.5 py-1.5">
                      前回否認理由: {slot.reject_reason}
                    </p>
                  )}

                  {slot.status === 'pending' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(slot)}
                      pending={isCancelling && cancellingSlotNo === slot.slot_no}
                      disabled={isCancelling}
                      icon={<X />}
                      className="h-auto gap-1 px-0 py-0 text-[11px] font-bold text-ink-subtle hover:bg-transparent hover:text-rose-600 [&_svg]:size-3"
                    >
                      リクエストを取消す
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <ShellSectionTitle>コーチを選ぶ</ShellSectionTitle>

          {unmatchedSlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-surface rounded-card border border-line">
              <p className="text-sm font-bold text-ink-muted">すべての枠のマッチングが完了しています</p>
            </div>
          ) : (
            <div className="space-y-3">
              <CoachSearchFilters
                selectedDays={selectedDays}
                onToggleDay={handleToggleDay}
                selectedTimeBuckets={selectedTimeBuckets}
                onToggleTimeBucket={handleToggleTimeBucket}
                nameQuery={nameQuery}
                onChangeNameQuery={setNameQuery}
                onClear={handleClearFilter}
                hasFilter={hasFilter}
              />

              {/* 検索結果の件数。絞り込みの直後に置き、条件を変えたときの結果の増減が目に入るようにする */}
              {coaches.length > 0 && (
                <p className="flex items-baseline justify-between gap-3 px-1 pt-1 text-xs text-ink-muted" aria-live="polite">
                  <span>{hasFilter ? '条件に合うコーチ' : 'リクエストできるコーチ'}</span>
                  <span className="shrink-0">
                    {hasFilter && <>全{coaches.length}人中 </>}
                    <span className="text-sm font-bold text-ink">{filteredCoaches.length}</span>人
                  </span>
                </p>
              )}

              <AnimatePresence mode="popLayout">
                {coaches.length === 0 ? (
                  <p className="text-sm text-ink-subtle px-1 py-4">現在リクエスト可能なコーチがいません。</p>
                ) : filteredCoaches.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface rounded-card border border-line"
                  >
                    <div className="p-4 bg-canvas rounded-full mb-3">
                      <Users size={28} strokeWidth={1.5} className="text-ink-subtle" />
                    </div>
                    <p className="text-sm font-bold text-ink-muted">条件に合うコーチが見つかりませんでした</p>
                    <p className="text-[11px] text-ink-subtle mt-1">条件を変更してお試しください</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearFilter}
                      icon={<RotateCcw />}
                      className="mt-4 rounded-control"
                    >
                      条件をリセット
                    </Button>
                  </motion.div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {filteredCoaches.map((coach) => (
                      <motion.div
                        key={coach.user_id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                      >
                        <CoachCard
                          coach={coach}
                          countries={countries}
                          onRequest={setRequestTarget}
                          selectedDays={selectedDays}
                          selectedTimeBuckets={selectedTimeBuckets}
                          slotRelations={slotRelationsByCoach.get(coach.user_id) ?? []}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      <RequestDialog
        coach={requestTarget}
        ticketId={ticket.ticket_id}
        unmatchedSlots={unmatchedSlots}
        onClose={() => setRequestTarget(null)}
        onRequested={handleSlotUpdate}
      />
    </>
  );
}
