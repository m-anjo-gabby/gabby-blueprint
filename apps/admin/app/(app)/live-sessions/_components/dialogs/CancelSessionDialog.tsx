'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { cancelSessionAsAdmin } from '@/actions/adminLiveSessionAction';
import { formatSessionDateTime } from './formatSessionDateTime';
import type { CoachSessionListItem } from '@gabby/types/coachStudent';

interface Props {
  target: CoachSessionListItem | null;
  onClose: () => void;
  onCancelled: () => Promise<void> | void;
}

/**
 * セッションのキャンセル（アドミン代理操作）。生徒・コーチ自身のキャンセルと異なり、
 * 12時間ルール等の自動判定は行わず、チケット返還可否を管理者が明示的にチェックボックスで指定する
 * （cancel_session RPCのp_admin_refund_ticketにそのまま渡る）。
 */
export function CancelSessionDialog({ target, onClose, onCancelled }: Props) {
  const { showToast } = useToast();
  const [refund, setRefund] = useState(true);
  const [reason, setReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const handleClose = (open: boolean) => {
    if (open) return;
    onClose();
    setRefund(true);
    setReason('');
  };

  const handleCancel = async () => {
    if (!target) return;
    setIsCancelling(true);
    try {
      const result = await cancelSessionAsAdmin(target.session_id, refund, reason || undefined);
      if (result.success) {
        showToast('セッションをキャンセルしました', 'success');
        handleClose(false);
        await onCancelled();
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>セッションのキャンセル（代理操作）</DialogTitle>
          <DialogDescription>
            {target && formatSessionDateTime(target.start_datetime)} のセッションをキャンセルします。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <Checkbox id="cancel-refund" checked={refund} onCheckedChange={(v) => setRefund(v === true)} />
            <Label htmlFor="cancel-refund" className="text-xs font-semibold text-slate-600 cursor-pointer">
              チケットを返還する（未割当扱いに戻し、再予約可能にする）
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">理由（任意・内部メモ）</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 顧客都合によりサポート窓口経由で調整" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isCancelling}>
            閉じる
          </Button>
          <Button type="button" onClick={handleCancel} disabled={isCancelling} className="bg-rose-600 hover:bg-rose-700">
            {isCancelling && <Loader2 size={14} className="animate-spin" />}
            キャンセルする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
