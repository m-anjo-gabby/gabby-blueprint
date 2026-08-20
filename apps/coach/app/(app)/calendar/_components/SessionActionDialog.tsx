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
import { cancelSession, rescheduleSession } from '@/actions/sessionAction';
import { getMyAvailability } from '@/actions/availabilityAction';
import { CoachAvailabilitySlot } from '@gabby/types/coachAvailability';
import { SessionListItem } from '@gabby/types/session';

export interface SessionActionTarget {
  session: SessionListItem;
  mode: 'cancel' | 'reschedule';
}

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

export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  const [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<CoachAvailabilitySlot[]>([]);
  const [newDate, setNewDate] = useState(tomorrowIsoDate());
  const [newStartTime, setNewStartTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (target?.mode === 'reschedule') {
      setNewDate(tomorrowIsoDate());
      setNewStartTime(null);
      getMyAvailability().then(setAvailability);
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
                Cancel your lesson with {target.session.counterpart_name}. This does not consume the student&apos;s session ticket.
              </DialogDescription>
            </DialogHeader>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="button" onClick={handleReschedule} disabled={isSubmitting || !newStartTime}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Reschedule
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
