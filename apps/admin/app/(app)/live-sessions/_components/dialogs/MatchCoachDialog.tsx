'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { useToast } from '@gabby/lib/hooks/useToast';
import { matchStudentWithCoachAsAdmin } from '@/actions/adminLiveSessionAction';
import { ADMIN_TIME_OPTIONS } from './adminTimeOptions';
import type { AdminCoachSummary } from '@gabby/types/adminLiveSession';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
// レッスン自体の実施時間（枠は30分だが実施は25分。マッチング申請時と同じ前提）
const LESSON_DURATION_MINUTES = 25;

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

interface Props {
  open: boolean;
  initialSlotNo: number;
  ticketId: string;
  coaches: AdminCoachSummary[];
  onClose: () => void;
  onMatched: () => Promise<void> | void;
}

/**
 * コーチとの直接マッチング（アドミン代理操作）。生徒のリクエスト・コーチの承認を経ずに、
 * その場でマッチングを成立させ、セッションも自動で予約する（24時間ルールの対象外）。
 */
export function MatchCoachDialog({ open, initialSlotNo, ticketId, coaches, onClose, onMatched }: Props) {
  const t = useTranslations('liveSessions.matchDialog');
  const tDay = useTranslations('liveSessions.day');
  const { showToast } = useToast();
  const [coachId, setCoachId] = useState('');
  const [slotNo, setSlotNo] = useState(String(initialSlotNo));
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [isMatching, setIsMatching] = useState(false);

  useEffect(() => {
    if (open) setSlotNo(String(initialSlotNo));
  }, [open, initialSlotNo]);

  const reset = () => {
    onClose();
    setCoachId('');
    setSlotNo(String(initialSlotNo));
    setDayOfWeek('1');
    setStartTime('');
  };

  const handleMatch = async () => {
    if (!coachId || !startTime) return;
    setIsMatching(true);
    try {
      const result = await matchStudentWithCoachAsAdmin({
        ticketId,
        coachId,
        slotNo: Number(slotNo),
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime: addMinutesToTime(startTime, LESSON_DURATION_MINUTES),
      });
      if (result.success) {
        showToast(t('toastSuccess'), 'success');
        reset();
        await onMatched();
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('coachLabel')}</Label>
            <SearchableSelect
              options={coaches.map((c) => ({ value: c.id, label: c.user_name }))}
              value={coachId}
              onChange={setCoachId}
              placeholder={t('coachPlaceholder')}
              searchPlaceholder={t('coachSearchPlaceholder')}
              className="bg-white"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('slotNoLabel')}</Label>
              <input
                type="number"
                min={1}
                value={slotNo}
                onChange={(e) => setSlotNo(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('dayOfWeekLabel')}</Label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {DAY_KEYS.map((key, i) => (
                  <option key={i} value={i}>{tDay(key)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('timeLabel')}</Label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="" disabled>{t('timePlaceholder')}</option>
                {ADMIN_TIME_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            {t('hint1')}<br />
            {t('hint2')}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={reset} disabled={isMatching}>
            {t('close')}
          </Button>
          <Button type="button" onClick={handleMatch} disabled={isMatching || !coachId || !startTime}>
            {isMatching && <Loader2 size={14} className="animate-spin" />}
            {t('confirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
