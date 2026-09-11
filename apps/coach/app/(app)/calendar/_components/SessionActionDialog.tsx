'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, X as XIcon } from 'lucide-react';
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
import { cancelSession, checkSessionConflict, resolveStaleSession } from '@/actions/sessionAction';
import { SESSION_STATUS, SessionListItem, SessionStatus } from '@gabby/types/session';
import type { ProposedSlotInput } from '@gabby/types/session';

// セッション枠は30分単位（実施自体は25分）のため、提案時間も同じ粒度に揃える。
// 一日全体を対象にするのは、コーチが今回限りの候補として通常のAvailability外の
// 時間も提案できるようにするため（Availability自体はこの一覧の生成に使わない）。
const PROPOSED_TIME_OPTIONS = generateLessonStartTimeOptions('00:00', '23:59');

export interface SessionActionTarget {
  session: SessionListItem;
  mode: 'cancel' | 'resolve';
}

const RESOLVE_STATUS_OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: SESSION_STATUS.COMPLETED, label: 'Completed (conducted outside the app)' },
  { value: SESSION_STATUS.EARLY_ENDED, label: 'Ended early' },
  { value: SESSION_STATUS.NO_SHOW, label: 'No-show' },
];

const MAX_PROPOSED_SLOTS = 3;

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

export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  const currentUserId = useUserStore((state) => state.user?.id);
  const [reason, setReason] = useState('');
  const [proposedSlots, setProposedSlots] = useState<ProposedSlotDraft[]>([]);
  const [resolvedStatus, setResolvedStatus] = useState<SessionStatus>(SESSION_STATUS.COMPLETED);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setReason('');
    setProposedSlots([]);
    if (target?.mode === 'resolve') {
      setResolvedStatus(SESSION_STATUS.COMPLETED);
    }
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
      currentUserId,
      target.session.counterpart_id,
      start.toISOString(),
      end.toISOString(),
      target.session.session_id
    );

    setProposedSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (!result.success) return { ...s, isChecking: false };
        const message = result.coachConflict
          ? 'You already have another session at this time.'
          : result.studentConflict
            ? 'The student already has another session at this time.'
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
      onResolved(target.session.session_id, { status: 4, cancel_reason: reason || null });
      showToast(
        proposedSlotInputs.length > 0 ? 'Session cancelled. Your proposed times were sent to the student.' : 'Session cancelled.',
        'success'
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (!target || !reason.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await resolveStaleSession(target.session.session_id, resolvedStatus, reason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(target.session.session_id, { status: resolvedStatus });
      showToast('Session resolved.', 'success');
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
              <DialogTitle>Cancel Session</DialogTitle>
              <DialogDescription>
                Cancel your lesson with {target.session.counterpart_name}.
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs rounded-lg px-3 py-2 border text-emerald-700 bg-emerald-50 border-emerald-100">
              As the coach, the student&apos;s ticket is always refunded. Booking a new time is up to the
              student — you can optionally suggest times below, but the choice is theirs.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I'm unable to make this time." />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Propose alternative times (optional, up to {MAX_PROPOSED_SLOTS})</Label>
                {proposedSlots.length < MAX_PROPOSED_SLOTS && (
                  <Button type="button" size="sm" variant="outline" onClick={addProposedSlot}>
                    <Plus size={13} />
                    Add time
                  </Button>
                )}
              </div>
              {proposedSlots.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  These don&apos;t have to be within your usual availability — offer any time that works for you this once.
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
                            Time
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
                          title="Remove"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                      {slot.isChecking && <p className="text-[11px] text-slate-400">Checking…</p>}
                      {slot.conflictMessage && <p className="text-[11px] text-rose-600">{slot.conflictMessage}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="button" onClick={handleCancel} disabled={isSubmitting || hasBlockingConflict}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Cancel Session
              </Button>
            </DialogFooter>
          </>
        )}

        {target?.mode === 'resolve' && (
          <>
            <DialogHeader>
              <DialogTitle>Resolve Session</DialogTitle>
              <DialogDescription>
                This session with {target.session.counterpart_name} is past its scheduled end time but still shows as
                scheduled (e.g. it was conducted outside the app, or the End Session button was never pressed). Record
                what actually happened.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Outcome</Label>
                <select
                  value={resolvedStatus}
                  onChange={(e) => setResolvedStatus(Number(e.target.value) as SessionStatus)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                >
                  {RESOLVE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Reason (required)</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Conducted the lesson over a direct Zoom call instead." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="button" onClick={handleResolve} disabled={isSubmitting || !reason.trim()}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Resolve
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
