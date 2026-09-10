'use client';

import { useState } from 'react';
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

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

/**
 * 「レッスン終了」時、在室重複時間が20分未満だった場合にのみ表示する理由入力ダイアログ。
 * finalize_sessionがerrorCode:'reason_required'を返した場合にuseEndLessonフックから開かれる。
 */
export function EndLessonReasonDialog({ open, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setReason('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(reason.trim());
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Session ended early</DialogTitle>
          <DialogDescription>
            The coach and student were connected together for less than 20 minutes. Please provide a reason before this session can be recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Student had connectivity issues and we agreed to reschedule."
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !reason.trim()}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
