'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { rescheduleSessionAsAdmin } from '@/actions/adminLiveSessionAction';
import { formatSessionDateTime } from './formatSessionDateTime';
import { ADMIN_TIME_OPTIONS } from './adminTimeOptions';
import type { CoachSessionListItem } from '@gabby/types/coachStudent';

interface Props {
  target: CoachSessionListItem | null;
  onClose: () => void;
  onRescheduled: () => Promise<void> | void;
}

/** セッションの振替（アドミン代理操作）。コーチの空き時間・重複はRPC側で自動チェックされる。 */
export function RescheduleSessionDialog({ target, onClose, onRescheduled }: Props) {
  const { showToast } = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const handleClose = (open: boolean) => {
    if (open) return;
    onClose();
    setDate('');
    setTime('');
    setReason('');
  };

  const handleReschedule = async () => {
    if (!target || !date || !time) return;
    setIsRescheduling(true);
    try {
      const duration = new Date(target.end_datetime).getTime() - new Date(target.start_datetime).getTime();
      const newStart = new Date(`${date}T${time}:00`);
      const newEnd = new Date(newStart.getTime() + duration);
      const result = await rescheduleSessionAsAdmin(target.session_id, newStart.toISOString(), newEnd.toISOString(), reason || undefined);
      if (result.success) {
        showToast('セッションを振替しました', 'success');
        handleClose(false);
        await onRescheduled();
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>セッションの振替（代理操作）</DialogTitle>
          <DialogDescription>
            {target && formatSessionDateTime(target.start_datetime)} のセッションを振替します。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">新しい日付</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">新しい開始時刻</Label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="" disabled>時刻</option>
              {ADMIN_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">理由（任意・内部メモ）</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <p className="text-[10px] text-slate-400">※ 新しい時刻はコーチの空き時間・重複が自動チェックされます</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isRescheduling}>
            閉じる
          </Button>
          <Button type="button" onClick={handleReschedule} disabled={isRescheduling || !date || !time}>
            {isRescheduling && <Loader2 size={14} className="animate-spin" />}
            振替する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
