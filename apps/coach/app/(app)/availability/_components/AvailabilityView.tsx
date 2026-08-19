'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Save, RotateCcw, Globe } from 'lucide-react';
import { addAvailability, deleteAvailability } from '@/actions/availabilityAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { CoachAvailabilitySlot, DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { TimezoneMaster } from '@gabby/types/timezone';
import { DAY_OF_WEEK_LABEL_EN } from '@/constants/availability';
import { WeeklyAvailabilityGrid, SLOTS_PER_DAY, slotKey, slotIndexToLabel } from './WeeklyAvailabilityGrid';

interface AvailabilityViewProps {
  initialSlots: CoachAvailabilitySlot[];
  timezones: TimezoneMaster[];
}

interface TimeRange {
  day: DayOfWeek;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
}

function timeToSlotIndex(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  return h * 2 + (m >= 30 ? 1 : 0);
}

function timeToSlotIndexEnd(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  const minutes = h * 60 + m;
  return Math.ceil(minutes / 30);
}

/** Expands stored ranges onto the 30-minute grid, rounding outward so no time is lost. */
function expandSlotsToSelection(slots: CoachAvailabilitySlot[]): Set<string> {
  const set = new Set<string>();
  for (const slot of slots) {
    const start = timeToSlotIndex(slot.start_time);
    const end = timeToSlotIndexEnd(slot.end_time);
    for (let i = start; i < end; i++) {
      set.add(slotKey(slot.day_of_week, i));
    }
  }
  return set;
}

function mergeSelectionToRanges(selection: Set<string>): TimeRange[] {
  const ranges: TimeRange[] = [];
  for (const day of DAYS_OF_WEEK) {
    let rangeStart: number | null = null;
    let prev: number | null = null;
    for (let i = 0; i <= SLOTS_PER_DAY; i++) {
      const selected = i < SLOTS_PER_DAY && selection.has(slotKey(day, i));
      if (selected) {
        if (rangeStart === null) rangeStart = i;
        prev = i;
      } else if (rangeStart !== null && prev !== null) {
        ranges.push({ day, start_time: slotIndexToLabel(rangeStart), end_time: slotIndexToLabel(prev + 1) });
        rangeStart = null;
        prev = null;
      }
    }
  }
  return ranges;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

function rangeKey(day: DayOfWeek, start: string, end: string): string {
  return `${day}_${start}_${end}`;
}

/** Derives a "UTC+09:00" style offset label for an IANA timezone name (DST-aware). */
function getUtcOffsetLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(new Date());
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (!raw) return '';
    return raw === 'GMT' ? 'UTC+00:00' : raw.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

export function AvailabilityView({ initialSlots, timezones }: AvailabilityViewProps) {
  const [slots, setSlots] = useState<CoachAvailabilitySlot[]>(initialSlots);
  const [selection, setSelection] = useState<Set<string>>(() => expandSlotsToSelection(initialSlots));
  const [originalSelection, setOriginalSelection] = useState<Set<string>>(() => expandSlotsToSelection(initialSlots));
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const timezoneLabel = useMemo(
    () => timezones.find((tz) => tz.timezone === timezone)?.display_name_en ?? timezone,
    [timezones, timezone]
  );
  const offsetLabel = useMemo(() => getUtcOffsetLabel(timezone), [timezone]);

  const isDirty = !setsEqual(selection, originalSelection);
  const previewRanges = useMemo(() => mergeSelectionToRanges(selection), [selection]);

  const handleReset = () => setSelection(new Set(originalSelection));

  const handleSave = async () => {
    const oldTuples = slots.map((s) => ({
      availability_id: s.availability_id,
      day: s.day_of_week,
      start: s.start_time.slice(0, 5),
      end: s.end_time.slice(0, 5),
    }));
    const oldKeyToId = new Map(oldTuples.map((t) => [rangeKey(t.day, t.start, t.end), t.availability_id]));
    const newKeySet = new Set(previewRanges.map((r) => rangeKey(r.day, r.start_time, r.end_time)));

    const toDelete = oldTuples.filter((t) => !newKeySet.has(rangeKey(t.day, t.start, t.end)));
    const toAdd = previewRanges.filter((r) => !oldKeyToId.has(rangeKey(r.day, r.start_time, r.end_time)));

    if (toDelete.length === 0 && toAdd.length === 0) return;

    if (toDelete.length > 0) {
      const ok = await showConfirm(
        'Save changes?',
        `This removes ${toDelete.length} time block${toDelete.length > 1 ? 's' : ''} from your availability. Students will no longer be able to book those times, but already scheduled sessions are not affected.`,
        { variant: 'danger', confirmText: 'Save', cancelText: 'Cancel' }
      );
      if (!ok) return;
    }

    setIsSaving(true);
    try {
      const [deleteResults, addResults] = await Promise.all([
        Promise.all(toDelete.map((t) => deleteAvailability(t.availability_id))),
        Promise.all(toAdd.map((r) => addAvailability({ day_of_week: r.day, start_time: r.start_time, end_time: r.end_time }))),
      ]);

      const deletedIds = new Set(toDelete.filter((_, i) => deleteResults[i].success).map((t) => t.availability_id));
      const addedSlots = addResults.filter((r): r is { success: true; slot: CoachAvailabilitySlot } => r.success).map((r) => r.slot);
      const failedCount = deleteResults.filter((r) => !r.success).length + addResults.filter((r) => !r.success).length;

      const updatedSlots = [...slots.filter((s) => !deletedIds.has(s.availability_id)), ...addedSlots];
      setSlots(updatedSlots);
      const updatedSelection = expandSlotsToSelection(updatedSlots);
      setSelection(updatedSelection);
      setOriginalSelection(updatedSelection);

      if (failedCount === 0) {
        showToast('Availability updated', 'success');
      } else {
        showToast(`${failedCount} change(s) could not be saved. Please try again.`, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CardTitle>Weekly Schedule</CardTitle>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
              <Globe size={11} />
              {timezoneLabel}
              {offsetLabel ? ` (${offsetLabel})` : ''}
            </span>
          </div>
          <CardDescription>
            Click or drag to mark the days and times you are available. Sessions are booked in 30-minute blocks (each lesson runs 25 minutes).
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!isDirty || isSaving}>
            <RotateCcw size={13} />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WeeklyAvailabilityGrid selection={selection} onChange={setSelection} disabled={isSaving} />

        <div className="flex flex-wrap gap-2">
          {previewRanges.length === 0 ? (
            <p className="text-sm text-slate-500">No availability set yet. Select blocks above to get started.</p>
          ) : (
            DAYS_OF_WEEK.map((day) =>
              previewRanges
                .filter((r) => r.day === day)
                .map((r) => (
                  <span
                    key={rangeKey(r.day, r.start_time, r.end_time)}
                    className="inline-flex items-center gap-1.5 pl-3 pr-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold"
                  >
                    {DAY_OF_WEEK_LABEL_EN[day]} {r.start_time} - {r.end_time}
                  </span>
                ))
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
