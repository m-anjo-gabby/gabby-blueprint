'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';
import { bookMakeupSession } from '@/actions/sessionAction';
import { getMyAvailability } from '@/actions/availabilityAction';
import { CoachAvailabilitySlot } from '@gabby/types/coachAvailability';

interface BookMakeupSessionDialogProps {
  scheduleId: string | null;
  onClose: () => void;
  onBooked: () => void;
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

/**
 * Books a new session against an unassigned ticket (a refunded cancellation) for a
 * lesson schedule this coach is already assigned to. Since the schedule fixes the
 * coach, this only needs a date/time within the coach's own availability.
 */
export function BookMakeupSessionDialog({ scheduleId, onClose, onBooked }: BookMakeupSessionDialogProps) {
  const [availability, setAvailability] = useState<CoachAvailabilitySlot[]>([]);
  const [newDate, setNewDate] = useState(tomorrowIsoDate());
  const [newStartTime, setNewStartTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (scheduleId) {
      setNewDate(tomorrowIsoDate());
      setNewStartTime(null);
      getMyAvailability().then(setAvailability);
    }
  }, [scheduleId]);

  const startTimeOptions = useMemo(() => {
    const dow = localDayOfWeek(newDate);
    return availability
      .filter((a) => a.day_of_week === dow)
      .flatMap((a) => generateLessonStartTimeOptions(a.start_time, a.end_time));
  }, [availability, newDate]);

  const handleSubmit = async () => {
    if (!scheduleId || !newStartTime) return;
    setIsSubmitting(true);
    try {
      const result = await bookMakeupSession(scheduleId, newDate, newStartTime);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('Session booked.', 'success');
      onBooked();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!scheduleId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book Unassigned Ticket</DialogTitle>
          <DialogDescription>Choose a new date and time within your own declared availability.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
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
            <Label>Start time</Label>
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Back
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !newStartTime}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
