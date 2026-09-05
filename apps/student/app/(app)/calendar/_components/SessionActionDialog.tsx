'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';
import { cancelSession, rescheduleSession, getCoachAvailabilityForReschedule } from '@/actions/sessionAction';
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

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function isWithin12Hours(startDatetime: string): boolean {
  return new Date(startDatetime).getTime() - Date.now() < TWELVE_HOURS_MS;
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
      getCoachAvailabilityForReschedule(target.session.counterpart_id).then(setAvailability);
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
      onResolved(target.session.session_id, { status: 3, cancel_reason: reason || null });
      showToast('レッスンをキャンセルしました', 'success');
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
      showToast('振替が完了しました。カレンダーが更新されます。', 'success');
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
              <DialogTitle>レッスンをキャンセル</DialogTitle>
              <DialogDescription>
                {target.session.counterpart_name}コーチとのレッスンをキャンセルします。
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
                ? '開始12時間を切っているため、チケットは返還されません（再予約できません）。'
                : 'チケットが返還され、担当コーチで再予約可能になります。'}
            </p>
            <div className="space-y-1.5">
              <Label>理由（任意）</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：体調不良のため" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                戻る
              </Button>
              <Button type="button" onClick={handleCancel} disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                キャンセルする
              </Button>
            </DialogFooter>
          </>
        )}

        {target?.mode === 'reschedule' && (
          <>
            <DialogHeader>
              <DialogTitle>レッスンを振替</DialogTitle>
              <DialogDescription>
                {target.session.counterpart_name}コーチの対応可能時間内で、新しい日時を選択してください。
              </DialogDescription>
            </DialogHeader>
            {isWithin12Hours(target.session.start_datetime) ? (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                開始12時間を切っているため振替できません。
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>新しい日付</Label>
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
                  <Label>新しい開始時刻</Label>
                  {startTimeOptions.length === 0 ? (
                    <p className="text-xs text-rose-600">この日はコーチの対応可能時間がありません。</p>
                  ) : (
                    <select
                      value={newStartTime ?? ''}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                    >
                      <option value="" disabled>
                        時刻を選択
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
                  <Label>理由（任意）</Label>
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                戻る
              </Button>
              <Button
                type="button"
                onClick={handleReschedule}
                disabled={isSubmitting || !newStartTime || isWithin12Hours(target.session.start_datetime)}
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                振替する
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
