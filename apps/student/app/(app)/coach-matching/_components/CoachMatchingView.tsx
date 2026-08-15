'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { CoachCard } from './CoachCard';
import { RequestDialog } from './RequestDialog';
import { cancelMatchingRequest } from '@/actions/matchingAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { CoachBrowseItem, SlotStatusItem } from '@gabby/types/matching';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { LiveSessionTicketSummary } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';

interface CoachMatchingViewProps {
  ticket: LiveSessionTicketSummary;
  initialSlots: SlotStatusItem[];
  coaches: CoachBrowseItem[];
}

const STATUS_BADGE: Record<SlotStatusItem['status'], { label: string; className: string }> = {
  matched: { label: 'マッチング済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: '承認待ち', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  unmatched: { label: '未マッチング', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

export function CoachMatchingView({ ticket, initialSlots, coaches }: CoachMatchingViewProps) {
  const [slots, setSlots] = useState<SlotStatusItem[]>(initialSlots);
  const [cancellingSlotNo, setCancellingSlotNo] = useState<number | null>(null);
  const [dialogTarget, setDialogTarget] = useState<{
    coach: CoachBrowseItem;
    dayOfWeek: DayOfWeek;
    blockStartTime: string;
    blockEndTime: string;
  } | null>(null);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const unmatchedSlots = slots.filter((s) => s.status === 'unmatched');

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
    <>
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

                {slot.coach_name && slot.day_of_week !== null && slot.start_time && slot.end_time && (
                  <p className="text-xs text-slate-600">
                    {slot.coach_name} ・ {DAY_OF_WEEK_LABEL_JA[slot.day_of_week]} {formatTimeRange(slot.start_time, slot.end_time)}
                  </p>
                )}

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
        ) : coaches.length === 0 ? (
          <p className="text-sm text-slate-400 px-1">現在リクエスト可能なコーチがいません。</p>
        ) : (
          <div className="space-y-3">
            {coaches.map((coach) => (
              <CoachCard
                key={coach.user_id}
                coach={coach}
                onSelectBlock={(dayOfWeek, startTime, endTime) =>
                  setDialogTarget({ coach, dayOfWeek, blockStartTime: startTime, blockEndTime: endTime })
                }
              />
            ))}
          </div>
        )}
      </section>

      <RequestDialog
        target={dialogTarget}
        ticketId={ticket.ticket_id}
        unmatchedSlots={unmatchedSlots}
        onClose={() => setDialogTarget(null)}
        onRequested={handleSlotUpdate}
      />
    </>
  );
}
