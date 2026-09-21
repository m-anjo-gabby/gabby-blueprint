'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { bookMakeupSessionAsAdmin } from '@/actions/adminLiveSessionAction';
import { ADMIN_TIME_OPTIONS } from './adminTimeOptions';
import type { AdminScheduleSlotSummary } from '@gabby/types/adminLiveSession';

interface Props {
  target: AdminScheduleSlotSummary | null;
  onClose: () => void;
  onBooked: () => Promise<void> | void;
}

/** 未割当チケットの新規予約（アドミン代理操作）。コーチの空き時間内である必要がある。 */
export function BookSessionDialog({ target, onClose, onBooked }: Props) {
  const { showToast } = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  const handleClose = (open: boolean) => {
    if (open) return;
    onClose();
    setDate('');
    setTime('');
  };

  const handleBook = async () => {
    if (!target || !date || !time) return;
    setIsBooking(true);
    try {
      const [startH, startM, startS] = target.start_time.split(':').map(Number);
      const [endH, endM, endS] = target.end_time.split(':').map(Number);
      const duration = ((endH * 60 + endM) * 60 + (endS ?? 0)) * 1000 - ((startH * 60 + startM) * 60 + (startS ?? 0)) * 1000;
      const newStart = new Date(`${date}T${time}:00`);
      const newEnd = new Date(newStart.getTime() + duration);
      const result = await bookMakeupSessionAsAdmin(target.schedule_id, newStart.toISOString(), newEnd.toISOString());
      if (result.success) {
        showToast('セッションを予約しました', 'success');
        handleClose(false);
        await onBooked();
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>セッションの予約（代理操作）</DialogTitle>
          <DialogDescription>
            {target && `第${target.slot_no}枠（担当: ${target.coach_name}）の未割当チケットで新規セッションを予約します。`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">日付</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">開始時刻</Label>
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
        <p className="text-[10px] text-slate-400">※ コーチの空き時間内である必要があります</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isBooking}>
            閉じる
          </Button>
          <Button type="button" onClick={handleBook} disabled={isBooking || !date || !time}>
            {isBooking && <Loader2 size={14} className="animate-spin" />}
            予約する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
