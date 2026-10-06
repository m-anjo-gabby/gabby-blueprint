'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Globe, CheckCircle2, Info } from 'lucide-react';
import { addAvailability, deleteAvailability, confirmAvailability } from '@/actions/availabilityAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { getUtcOffsetMinutes, shiftWeeklyMinute } from '@gabby/lib/date/date';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import { CoachAvailabilitySlot, DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { TimezoneMaster } from '@gabby/types/timezone';
import { DAY_OF_WEEK_LABEL_EN } from '@/constants/availability';
import { WeeklyAvailabilityGrid, SLOTS_PER_DAY, slotKey, slotIndexToLabel } from './WeeklyAvailabilityGrid';

interface AvailabilityViewProps {
  initialSlots: CoachAvailabilitySlot[];
  /** When the coach last reviewed their availability (null if never) */
  initialConfirmedAt: string | null;
  timezones: TimezoneMaster[];
}

const SLOT_MINUTES = 30;
const REVIEW_INTERVAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Moves every grid cell by offsetMinutes (wrapping around the week). Converts between UTC and local cells. */
function shiftSelection(selection: Set<string>, offsetMinutes: number): Set<string> {
  const shifted = new Set<string>();
  for (const key of selection) {
    const [day, slotIndex] = key.split('-').map(Number);
    const moved = shiftWeeklyMinute(day, slotIndex * SLOT_MINUTES, offsetMinutes);
    shifted.add(slotKey(moved.day_of_week as DayOfWeek, Math.floor(moved.minute_of_day / SLOT_MINUTES)));
  }
  return shifted;
}

/**
 * Expands stored ranges (UTC) onto the local 30-minute grid, rounding outward so no time is lost.
 * offsetMinutes is the coach's current UTC offset (local = UTC + offset).
 */
function expandSlotsToSelection(slots: CoachAvailabilitySlot[], offsetMinutes: number): Set<string> {
  const utc = new Set<string>();
  for (const slot of slots) {
    const start = timeToSlotIndex(slot.start_time);
    const end = timeToSlotIndexEnd(slot.end_time);
    for (let i = start; i < end; i++) {
      utc.add(slotKey(slot.day_of_week, i));
    }
  }
  return shiftSelection(utc, offsetMinutes);
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

/**
 * Finds the next UTC offset change (daylight saving time) within the given number of days.
 * Returns the first day with the new offset and how many minutes local times shift, or null.
 */
function findUpcomingOffsetChange(timezone: string, withinDays: number): { date: Date; shiftMinutes: number } | null {
  const now = Date.now();
  const current = getUtcOffsetMinutes(timezone, new Date(now));
  for (let d = 1; d <= withinDays; d++) {
    const at = new Date(now + d * DAY_MS);
    const offset = getUtcOffsetMinutes(timezone, at);
    if (offset !== current) return { date: at, shiftMinutes: offset - current };
  }
  return null;
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

export function AvailabilityView({ initialSlots, initialConfirmedAt, timezones }: AvailabilityViewProps) {
  const timezone = useTimezone();
  // Availability is stored in UTC so students always see the same times. The grid shows it in the coach's
  // local time using today's offset, so the displayed times shift by an hour when daylight saving time changes.
  const offsetMinutes = useMemo(() => getUtcOffsetMinutes(timezone), [timezone]);
  const upcomingOffsetChange = useMemo(() => findUpcomingOffsetChange(timezone, REVIEW_INTERVAL_DAYS), [timezone]);
  const [slots, setSlots] = useState<CoachAvailabilitySlot[]>(initialSlots);
  const [selection, setSelection] = useState<Set<string>>(() => expandSlotsToSelection(initialSlots, offsetMinutes));
  const [originalSelection, setOriginalSelection] = useState<Set<string>>(() => expandSlotsToSelection(initialSlots, offsetMinutes));
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initialConfirmedAt);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const timezoneLabel = useMemo(
    () => timezones.find((tz) => tz.timezone === timezone)?.display_name_en ?? timezone,
    [timezones, timezone]
  );
  const offsetLabel = useMemo(() => getUtcOffsetLabel(timezone), [timezone]);

  const isDirty = !setsEqual(selection, originalSelection);
  const previewRanges = useMemo(() => mergeSelectionToRanges(selection), [selection]);

  const isReviewDue = !confirmedAt || Date.now() - new Date(confirmedAt).getTime() >= REVIEW_INTERVAL_DAYS * DAY_MS;

  const handleReset = () => setSelection(new Set(originalSelection));

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const result = await confirmAvailability();
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setConfirmedAt(result.confirmedAt);
      showToast('Thanks! Your availability is confirmed.', 'success');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSave = async () => {
    const oldTuples = slots.map((s) => ({
      availability_id: s.availability_id,
      day: s.day_of_week,
      start: s.start_time.slice(0, 5),
      end: s.end_time.slice(0, 5),
    }));
    const oldKeyToId = new Map(oldTuples.map((t) => [rangeKey(t.day, t.start, t.end), t.availability_id]));
    // Save in UTC: move the local cells back by the offset, then merge per UTC day
    const utcRanges = mergeSelectionToRanges(shiftSelection(selection, -offsetMinutes));
    const newKeySet = new Set(utcRanges.map((r) => rangeKey(r.day, r.start_time, r.end_time)));

    const toDelete = oldTuples.filter((t) => !newKeySet.has(rangeKey(t.day, t.start, t.end)));
    const toAdd = utcRanges.filter((r) => !oldKeyToId.has(rangeKey(r.day, r.start_time, r.end_time)));

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
      const updatedSelection = expandSlotsToSelection(updatedSlots, offsetMinutes);
      setSelection(updatedSelection);
      setOriginalSelection(updatedSelection);
      // Saving any change also marks the availability as reviewed (DB trigger)
      if (deletedIds.size > 0 || addedSlots.length > 0) setConfirmedAt(new Date().toISOString());

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
            Times are shown in your timezone. Students always see these slots at the same times, so when daylight saving time
            changes, the times shown here shift by one hour.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!isDirty || isSaving}>
            <RotateCcw size={13} />
            Reset
          </Button>
          <Button pending={isSaving} icon={<Save size={14} />} type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            Save Changes
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcomingOffsetChange && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              Daylight saving time changes on {formatDateEn(upcomingOffsetChange.date, timezone)}. From then, your availability
              will show {Math.abs(upcomingOffsetChange.shiftMinutes) / 60} hour{Math.abs(upcomingOffsetChange.shiftMinutes) === 60 ? '' : 's'}{' '}
              {upcomingOffsetChange.shiftMinutes > 0 ? 'later' : 'earlier'} in your local time. Please review it after the change.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-600">
            {slots.length === 0
              ? 'You have no availability yet. Students cannot send you matching requests until you add some.'
              : `${confirmedAt ? `Last reviewed ${formatDateEn(confirmedAt, timezone)}.` : 'Not reviewed yet.'}${isReviewDue ? ' Please check that these times still work for you.' : ''}`}
          </p>
          {slots.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              pending={isConfirming}
              icon={<CheckCircle2 size={14} />}
              onClick={handleConfirm}
              disabled={isDirty || isSaving || isConfirming}
            >
              No changes needed
            </Button>
          )}
        </div>

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
                    className="inline-flex items-center gap-1.5 pl-3 pr-3 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-strong text-xs font-bold"
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
