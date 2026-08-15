'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, X } from 'lucide-react';
import { addAvailability, deleteAvailability } from '@/actions/availabilityAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { CoachAvailabilitySlot, DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_EN } from '@/constants/availability';

interface AvailabilityViewProps {
  initialSlots: CoachAvailabilitySlot[];
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

export function AvailabilityView({ initialSlots }: AvailabilityViewProps) {
  const [slots, setSlots] = useState<CoachAvailabilitySlot[]>(initialSlots);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(2);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('22:00');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const slotsByDay = useMemo(() => {
    const map = new Map<DayOfWeek, CoachAvailabilitySlot[]>();
    for (const day of DAYS_OF_WEEK) map.set(day, []);
    for (const slot of slots) {
      map.get(slot.day_of_week)?.push(slot);
    }
    return map;
  }, [slots]);

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const result = await addAvailability({ day_of_week: dayOfWeek, start_time: startTime, end_time: endTime });
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setSlots((prev) => [...prev, result.slot]);
      showToast('Availability slot added', 'success');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (slot: CoachAvailabilitySlot) => {
    const ok = await showConfirm(
      'Remove this slot?',
      `Remove ${DAY_OF_WEEK_LABEL_EN[slot.day_of_week]} ${formatTimeRange(slot.start_time, slot.end_time)} from your availability?`,
      { variant: 'danger' }
    );
    if (!ok) return;

    setDeletingId(slot.availability_id);
    try {
      const result = await deleteAvailability(slot.availability_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setSlots((prev) => prev.filter((s) => s.availability_id !== slot.availability_id));
      showToast('Availability slot removed', 'success');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add Availability Slot</CardTitle>
          <CardDescription>Sessions are booked in 30-minute blocks (each lesson runs 25 minutes).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] items-end">
            <div className="space-y-1.5">
              <Label>Day</Label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value) as DayOfWeek)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>
                    {DAY_OF_WEEK_LABEL_EN[day]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              />
            </div>
            <Button type="button" onClick={handleAdd} disabled={isAdding}>
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {slots.length === 0 ? (
            <p className="text-sm text-slate-500">No availability set yet. Add a slot above to get started.</p>
          ) : (
            DAYS_OF_WEEK.map((day) => {
              const daySlots = slotsByDay.get(day) ?? [];
              if (daySlots.length === 0) return null;
              return (
                <div key={day} className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{DAY_OF_WEEK_LABEL_EN[day]}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((slot) => (
                      <span
                        key={slot.availability_id}
                        className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold"
                      >
                        {formatTimeRange(slot.start_time, slot.end_time)}
                        <button
                          type="button"
                          onClick={() => handleDelete(slot)}
                          disabled={deletingId === slot.availability_id}
                          className="p-0.5 rounded-full hover:bg-indigo-100 text-indigo-400 hover:text-indigo-700 transition-colors disabled:opacity-50"
                          aria-label="Remove slot"
                        >
                          {deletingId === slot.availability_id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <X size={12} />
                          )}
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
