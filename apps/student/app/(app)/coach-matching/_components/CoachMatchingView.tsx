'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Loader2, Users, X } from 'lucide-react';
import { CoachCard } from './CoachCard';
import { CoachSearchFilters } from './CoachSearchFilters';
import { RequestDialog } from './RequestDialog';
import { cancelMatchingRequest } from '@/actions/matchingAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { CoachBrowseItem, SlotStatusItem } from '@gabby/types/matching';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { CountryMaster } from '@gabby/types/country';
import { LiveSessionTicketSummary } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { convertWeeklyTimeZone } from '@gabby/lib/date/date';

interface CoachMatchingViewProps {
  ticket: LiveSessionTicketSummary;
  initialSlots: SlotStatusItem[];
  coaches: CoachBrowseItem[];
  countries: CountryMaster[];
}

const STATUS_BADGE: Record<SlotStatusItem['status'], { label: string; className: string }> = {
  matched: { label: 'マッチング済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: '承認待ち', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  unmatched: { label: '未マッチング', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

export function CoachMatchingView({ ticket, initialSlots, coaches, countries }: CoachMatchingViewProps) {
  const studentTimezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [slots, setSlots] = useState<SlotStatusItem[]>(initialSlots);
  const [cancellingSlotNo, setCancellingSlotNo] = useState<number | null>(null);
  const [requestTarget, setRequestTarget] = useState<CoachBrowseItem | null>(null);

  // --- コーチ検索フィルター（曜日・時刻範囲） ---
  const [selectedDays, setSelectedDays] = useState<Set<DayOfWeek>>(new Set());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const unmatchedSlots = slots.filter((s) => s.status === 'unmatched');

  const hasFilter = selectedDays.size > 0 || !!startTime || !!endTime;

  const filteredCoaches = useMemo(() => {
    if (!hasFilter) return coaches;
    return coaches.filter((coach) =>
      coach.availability.some((slot) => {
        const display = convertWeeklyTimeZone(slot, coach.timezone, studentTimezone);
        if (selectedDays.size > 0 && !selectedDays.has(display.day_of_week as DayOfWeek)) return false;
        if (startTime && display.end_time <= startTime) return false;
        if (endTime && display.start_time >= endTime) return false;
        return true;
      })
    );
  }, [coaches, hasFilter, selectedDays, startTime, endTime, studentTimezone]);

  const handleToggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleClearFilter = () => {
    setSelectedDays(new Set());
    setStartTime('');
    setEndTime('');
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

    setCancellingSlotNo(slot.slot_no);
    try {
      const result = await cancelMatchingRequest(slot.request_id);
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
    } finally {
      setCancellingSlotNo(null);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      {/* 1. ヘッダーエリア */}
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
            >
              <ChevronLeft size={24} />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">専属コーチを探す</h1>
          </div>

          <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm shrink-0">
            {filteredCoaches.length} <span className="opacity-60 ml-0.5">件</span>
          </div>
        </div>

        <p className="text-[13px] text-slate-500">
          週{ticket.weekly_frequency}回のレッスン枠ごとにコーチをリクエストできます。コーチが承認すると、契約期間分のレッスンが自動で予約されます。
        </p>
      </header>

      {/* 2. コンテンツエリア（スクロール） */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 bg-slate-50/50 space-y-6">
        <section className="space-y-3">
          <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest px-1">レッスン枠の状況</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => {
              const badge = STATUS_BADGE[slot.status];
              return (
                <div key={slot.slot_no} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-700">枠 {slot.slot_no}</p>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}>
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
                      <p className="text-xs text-slate-600">
                        {slot.coach_name} ・ {DAY_OF_WEEK_LABEL_JA[display.day_of_week as DayOfWeek]}{' '}
                        {formatTimeRange(display.start_time, display.end_time)}
                      </p>
                    );
                  })()}

                  {slot.status === 'unmatched' && slot.reject_reason && (
                    <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                      前回否認理由: {slot.reject_reason}
                    </p>
                  )}

                  {slot.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleCancel(slot)}
                      disabled={cancellingSlotNo === slot.slot_no}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                    >
                      {cancellingSlotNo === slot.slot_no ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                      リクエストを取消す
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest px-1">コーチを選ぶ</h2>

          {unmatchedSlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-slate-200">
              <p className="text-sm font-bold text-slate-500">すべての枠のマッチングが完了しています</p>
            </div>
          ) : (
            <>
              <CoachSearchFilters
                selectedDays={selectedDays}
                onToggleDay={handleToggleDay}
                startTime={startTime}
                endTime={endTime}
                onChangeStartTime={setStartTime}
                onChangeEndTime={setEndTime}
                onClear={handleClearFilter}
                hasFilter={hasFilter}
              />

              <AnimatePresence mode="popLayout">
                {coaches.length === 0 ? (
                  <p className="text-sm text-slate-400 px-1 py-4">現在リクエスト可能なコーチがいません。</p>
                ) : filteredCoaches.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200"
                  >
                    <div className="p-4 bg-slate-50 rounded-full mb-3">
                      <Users size={28} strokeWidth={1.5} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">条件に合うコーチが見つかりませんでした</p>
                    <p className="text-[11px] text-slate-400 mt-1">曜日・時間帯の条件を変更してお試しください</p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {filteredCoaches.map((coach) => (
                      <motion.div
                        key={coach.user_id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                      >
                        <CoachCard coach={coach} countries={countries} onRequest={setRequestTarget} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </>
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
    </div>
  );
}
