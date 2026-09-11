'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { cancelSession, checkSessionConflict } from '@/actions/sessionAction';
import { SessionListItem } from '@gabby/types/session';
import type { ProposedSlotInput } from '@gabby/types/session';

// セッション枠は30分単位のため、提案時間も同じ粒度に揃える。一日全体を対象にするのは、
// 「今回限りの候補」として通常の担当コーチの対応可能時間外も提案できるようにするため
// （コーチ側SessionActionDialogの候補提案と同じ設計）。
const PROPOSED_TIME_OPTIONS = generateLessonStartTimeOptions('00:00', '23:59');
const MAX_PROPOSED_SLOTS = 3;

export interface SessionActionTarget {
  session: SessionListItem;
  mode: 'cancel';
}

interface SessionActionDialogProps {
  target: SessionActionTarget | null;
  onClose: () => void;
  onResolved: (sessionId: string, patch: Partial<SessionListItem>) => void;
}

interface ProposedSlotDraft {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  conflictMessage: string | null;
  isChecking: boolean;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function isWithin12Hours(startDatetime: string): boolean {
  return new Date(startDatetime).getTime() - Date.now() < TWELVE_HOURS_MS;
}

export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  const currentUserId = useUserStore((state) => state.user?.id);
  const [reason, setReason] = useState('');
  const [proposedSlots, setProposedSlots] = useState<ProposedSlotDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setReason('');
    setProposedSlots([]);
  }, [target]);

  const addProposedSlot = () => {
    setProposedSlots((prev) =>
      prev.length >= MAX_PROPOSED_SLOTS ? prev : [...prev, { date: tomorrowIsoDate(), time: '', conflictMessage: null, isChecking: false }]
    );
  };

  const checkSlotConflict = async (index: number, date: string, time: string) => {
    if (!target || !currentUserId) return;
    setProposedSlots((prev) => prev.map((s, i) => (i === index ? { ...s, isChecking: true } : s)));

    const duration = new Date(target.session.end_datetime).getTime() - new Date(target.session.start_datetime).getTime();
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + duration);
    const result = await checkSessionConflict(
      target.session.counterpart_id,
      currentUserId,
      start.toISOString(),
      end.toISOString(),
      target.session.session_id
    );

    setProposedSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (!result.success) return { ...s, isChecking: false };
        const message = result.coachConflict
          ? 'コーチが同じ時間帯に別のセッションの予定があります。'
          : result.studentConflict
            ? 'ご自身が同じ時間帯に別のセッションの予定があります。'
            : null;
        return { ...s, isChecking: false, conflictMessage: message };
      })
    );
  };

  const updateProposedSlot = (index: number, patch: Partial<Pick<ProposedSlotDraft, 'date' | 'time'>>) => {
    setProposedSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch, conflictMessage: null } : slot)));
    const merged = { ...proposedSlots[index], ...patch };
    if (merged.date && merged.time) checkSlotConflict(index, merged.date, merged.time);
  };

  const removeProposedSlot = (index: number) => {
    setProposedSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const hasBlockingConflict = proposedSlots.some((s) => s.date && s.time && s.conflictMessage);

  const handleCancel = async () => {
    if (!target || hasBlockingConflict) return;
    setIsSubmitting(true);
    try {
      const validSlots = proposedSlots.filter((s) => s.date && s.time && !s.conflictMessage);
      const duration = new Date(target.session.end_datetime).getTime() - new Date(target.session.start_datetime).getTime();
      const proposedSlotInputs: ProposedSlotInput[] = validSlots.map((s) => {
        const start = new Date(`${s.date}T${s.time}:00`);
        const end = new Date(start.getTime() + duration);
        return { start_datetime: start.toISOString(), end_datetime: end.toISOString() };
      });

      const result = await cancelSession(target.session.session_id, reason, proposedSlotInputs);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(target.session.session_id, { status: 3, cancel_reason: reason || null });
      showToast(
        proposedSlotInputs.length > 0 ? 'セッションをキャンセルしました。提案した候補をコーチへ送信しました。' : 'セッションをキャンセルしました',
        'success'
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target?.mode === 'cancel' && (
          <>
            <DialogHeader>
              <DialogTitle>セッションをキャンセル</DialogTitle>
              <DialogDescription>
                {target.session.counterpart_name}コーチとのセッションをキャンセルします。
              </DialogDescription>
            </DialogHeader>
            <p
              className={cn(
                'text-xs rounded-lg px-3 py-2 border',
                isWithin12Hours(target.session.start_datetime)
                  ? 'text-rose-600 bg-rose-50 border-rose-100'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-100'
              )}
            >
              {isWithin12Hours(target.session.start_datetime)
                ? '開始12時間を切っているため、この回の予約枠は返還されません（再予約できません）。'
                : 'この回の予約枠が返還され、担当コーチへ改めて予約をリクエストできるようになります。'}
            </p>
            <div className="space-y-1.5">
              <Label>理由（任意）</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：体調不良のため" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>振替候補を提案する（任意、最大{MAX_PROPOSED_SLOTS}件）</Label>
                {proposedSlots.length < MAX_PROPOSED_SLOTS && (
                  <Button type="button" size="sm" variant="outline" onClick={addProposedSlot}>
                    <Plus size={13} />
                    候補を追加
                  </Button>
                )}
              </div>
              {proposedSlots.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  候補を提案しなくてもキャンセルできます。提案する場合、コーチの対応可能時間に関わらず、ご希望の時間を自由に選べます。
                </p>
              ) : (
                <div className="space-y-2">
                  {proposedSlots.map((slot, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          min={tomorrowIsoDate()}
                          value={slot.date}
                          onChange={(e) => updateProposedSlot(index, { date: e.target.value })}
                          className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                        />
                        <select
                          value={slot.time}
                          onChange={(e) => updateProposedSlot(index, { time: e.target.value })}
                          className="flex h-9 w-28 rounded-md border border-input bg-transparent px-2 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                        >
                          <option value="" disabled>
                            時刻
                          </option>
                          {PROPOSED_TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeProposedSlot(index)}
                          className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors p-1"
                          title="削除"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                      {slot.isChecking && <p className="text-[11px] text-slate-400">確認中…</p>}
                      {slot.conflictMessage && <p className="text-[11px] text-rose-600">{slot.conflictMessage}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                戻る
              </Button>
              <Button type="button" onClick={handleCancel} disabled={isSubmitting || hasBlockingConflict}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                キャンセルする
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
