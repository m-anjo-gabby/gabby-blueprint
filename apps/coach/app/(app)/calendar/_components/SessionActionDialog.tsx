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
import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';
import { cancelSession, rescheduleSession, resolveStaleSession } from '@/actions/sessionAction';
import { getMyAvailability } from '@/actions/availabilityAction';
import { CoachAvailabilitySlot } from '@gabby/types/coachAvailability';
import { SESSION_STATUS, SessionListItem, SessionStatus } from '@gabby/types/session';

export interface SessionActionTarget {
  session: SessionListItem;
  mode: 'cancel' | 'reschedule' | 'resolve';
}

const RESOLVE_STATUS_OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: SESSION_STATUS.COMPLETED, label: 'Completed (conducted outside the app)' },
  { value: SESSION_STATUS.EARLY_ENDED, label: 'Ended early' },
  { value: SESSION_STATUS.NO_SHOW, label: 'No-show' },
];

interface SessionActionDialogProps {
  target: SessionActionTarget | null;
  onClose: () => void;
  onResolved: (sessionId: string, patch: Partial<SessionListItem>) => void;
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

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function isWithin12Hours(startDatetime: string): boolean {
  return new Date(startDatetime).getTime() - Date.now() < TWELVE_HOURS_MS;
}

export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  const [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<CoachAvailabilitySlot[]>([]);
  const [newDate, setNewDate] = useState(tomorrowIsoDate());
  const [newStartTime, setNewStartTime] = useState<string | null>(null);
  const [resolvedStatus, setResolvedStatus] = useState<SessionStatus>(SESSION_STATUS.COMPLETED);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (target?.mode === 'reschedule') {
      setNewDate(tomorrowIsoDate());
      setNewStartTime(null);
      getMyAvailability().then(setAvailability);
    }
    if (target?.mode === 'resolve') {
      setResolvedStatus(SESSION_STATUS.COMPLETED);
    }
    setReason('');
  }, [target]);

  const startTimeOptions = useMemo(() => {
    if (!target || target.mode !== 'reschedule') return [];
    const dow = localDayOfWeek(newDate);
    return availability
      .filter((a) => a.day_of_week === dow)
      .flatMap((a) => generateLessonStartTimeOptions(a.start_time, a.end_time));
  }, [target, availability, newDate]);

  const handleCancel = async () => {
    if (!target) return;
    setIsSubmitting(true);
    try {
      const result = await cancelSession(target.session.session_id, reason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(target.session.session_id, { status: 4, cancel_reason: reason || null });
      showToast('Session cancelled.', 'success');
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

  const handleReschedule = async () => {
    if (!target || !newStartTime) return;
    setIsSubmitting(true);
    try {
      const result = await rescheduleSession(target.session.session_id, newDate, newStartTime, reason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(target.session.session_id, { status: 5, cancel_reason: reason || null });
      showToast('Session rescheduled. The calendar will refresh shortly.', 'success');
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
              As the coach, the student&apos;s ticket is always refunded and becomes available to book again with you.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I'm unable to make this time." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="button" onClick={handleCancel} disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Cancel Session
              </Button>
            </DialogFooter>
          </>
        )}

        {target?.mode === 'reschedule' && (
          <>
            <DialogHeader>
              <DialogTitle>Reschedule Session</DialogTitle>
              <DialogDescription>
                Move your lesson with {target.session.counterpart_name} to a new date and time within your availability.
              </DialogDescription>
            </DialogHeader>
            {isWithin12Hours(target.session.start_datetime) ? (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                This session starts in less than 12 hours and can no longer be rescheduled.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>New date</Label>
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
                  <Label>New start time</Label>
                  {startTimeOptions.length === 0 ? (
                    <p className="text-xs text-rose-600">You have no declared availability on this day.</p>
                  ) : (
                    <select
                      value={newStartTime ?? ''}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                    >
                      <option value="" disabled>
                        Select a time
                      </option>
                      {startTimeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Reason (optional)</Label>
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Back
              </Button>
              <Button
                type="button"
                onClick={handleReschedule}
                disabled={isSubmitting || !newStartTime || isWithin12Hours(target.session.start_datetime)}
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Reschedule
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
                scheduled (e.g. it was conducted outside the app, or the End Lesson button was never pressed). Record
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
