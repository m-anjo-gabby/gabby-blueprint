'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { adjustTargetSessionsAsAdmin } from '@/actions/adminLiveSessionAction';
import type { AdminScheduleSlotSummary } from '@gabby/types/adminLiveSession';

interface Props {
  target: AdminScheduleSlotSummary | null;
  onClose: () => void;
  onAdjusted: () => Promise<void> | void;
}

/**
 * 定期スケジュール枠のtarget_sessions個別引き上げ（アドミン代理操作）。
 * total_sessions（契約全体）は変更しない例外措置のため、理由(reason)入力を必須とする。
 */
export function AdjustTargetSessionsDialog({ target, onClose, onAdjusted }: Props) {
  const t = useTranslations('liveSessions.adjustTargetSessionsDialog');
  const { showToast } = useToast();
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // このダイアログのみ、対象スロットのtarget_sessionsを初期値として反映する必要があるため
  // （Cancel/Bookダイアログと異なり、フィールドの初期値がtargetのデータに依存する）
  useEffect(() => {
    if (target) setNewValue(String(target.target_sessions + 1));
  }, [target]);

  const handleClose = (open: boolean) => {
    if (open) return;
    onClose();
    setNewValue('');
    setReason('');
  };

  const parsedValue = Number(newValue);
  const isValueValid = target !== null && Number.isInteger(parsedValue) && parsedValue > target.target_sessions;

  const handleSubmit = async () => {
    if (!target || !isValueValid || !reason.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await adjustTargetSessionsAsAdmin(target.schedule_id, parsedValue, reason.trim());
      if (result.success) {
        showToast(t('toastSuccess'), 'success');
        handleClose(false);
        await onAdjusted();
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {target && t('description', { slotNo: target.slot_no, coach: target.coach_name })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {t('currentLabel')}: {target?.target_sessions}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('newValueLabel')}</Label>
            <Input
              type="number"
              min={target ? target.target_sessions + 1 : 1}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('reasonLabel')}</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('reasonPlaceholder')} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isSubmitting}>
            {t('close')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !isValueValid || !reason.trim()}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {t('confirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
