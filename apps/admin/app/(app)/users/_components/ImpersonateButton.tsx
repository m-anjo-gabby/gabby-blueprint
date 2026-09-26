'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LogIn, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useToast } from '@gabby/lib/hooks/useToast';
import { startImpersonation } from '@/actions/adminImpersonationAction';
import { UserRecord, USER_TYPES } from '@gabby/types/user';

interface Props {
  user: UserRecord;
}

/**
 * 障害対応・問合せ調査のため、対象ユーザーとして生徒／コーチポータルへ代理ログインするボタン。
 * 理由の入力を必須とし、実行内容は監査ログ(com_t_admin_impersonation_log)に記録される。
 */
export function ImpersonateButton({ user }: Props) {
  const t = useTranslations('users.impersonate');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const portalLabel = user.user_type === USER_TYPES.COACH ? t('coachPortal') : t('studentPortal');

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setReason('');
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await startImpersonation(user.id, reason);
      if (result.success && result.url) {
        // ユーザー種別ごとに固定のウィンドウ名を指定し、同一種別への連続代理ログインは
        // 既存タブを再利用させる（生徒⇔コーチは別タブで共存可能なまま維持する）。
        // window.opener は意図的に切り離さない。切り離すと別オリジンの生徒／コーチポータルを
        // 名前指定で再ナビゲートする権限（allowed to navigate）自体が失われ、2人目以降の
        // 代理ログインでブラウザにナビゲーションを拒否されるため（tabnabbing対策との両立不可）。
        window.open(result.url, `impersonate-${user.user_type}`);
        showToast(t('toastOpened'), 'success');
        handleOpenChange(false);
      } else {
        showToast(result.message || t('toastFailed'), 'error');
        setLoading(false);
      }
    } catch {
      showToast(tCommon('networkError'), 'error');
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
          <LogIn size={14} /> {t('button')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <LogIn size={18} className="text-brand-400" /> {t('title')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-white space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-700 font-medium">
              {t('warning', { name: user.user_name || user.email || '', portal: portalLabel })}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t('reasonLabel')}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
              className="rounded-xl border-slate-200 min-h-[80px]"
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t gap-3">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 text-slate-400 h-11 rounded-xl"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white shadow-lg h-11 rounded-xl font-bold"
            onClick={handleStart}
            disabled={loading || reason.trim().length === 0}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : t('openPortal', { portal: portalLabel })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
