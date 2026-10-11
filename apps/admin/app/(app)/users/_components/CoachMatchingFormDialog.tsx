'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, Loader2, UserSearch } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { isCoachMatchable } from '@gabby/lib/coachProfile/matchingReadiness';
import { CoachMatchingStatus } from '@gabby/types/coachProfile';
import { UserRecord } from '@gabby/types/user';
import { getCoachMatchingStatus, setCoachMatchingSuspension } from '@/actions/adminCoachMatchingAction';

interface Props {
  user: UserRecord;
  children: React.ReactNode;
}

/**
 * コーチのマッチング対象の設定ダイアログ（アドミンのみ）。生徒の「専属コーチを探す」に出るかどうかの内訳
 * （必須項目・コーチ本人の受付）を表示し、アドミンによる休止（理由のメモ付き）を設定する。
 */
export function CoachMatchingFormDialog({ user, children }: Props) {
  const t = useTranslations('users.matching');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CoachMatchingStatus | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [note, setNote] = useState('');
  const [isSaving, startSave] = useTransition();

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const loaded = await getCoachMatchingStatus(user.id);
      if (!loaded) {
        showToast(t('loadFailed'), 'error');
        return;
      }
      setStatus(loaded);
      setSuspended(loaded.isSuspended);
      setNote(loaded.suspendedNote ?? '');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    startSave(async () => {
      const result = await setCoachMatchingSuspension(user.id, suspended, suspended ? note.trim() || null : null);
      if (!result.success) {
        showToast(t('errorSave'), 'error');
        return;
      }
      showToast(suspended ? t('toastSuspended') : t('toastResumed'), 'success');
      setOpen(false);
    });
  };

  const isVisible = status !== null && isCoachMatchable({ ...status, isSuspended: suspended });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 shadow-2xl border-none [&>button]:text-white [&>button]:opacity-70 max-h-[90vh] flex flex-col rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <UserSearch size={18} className="text-brand-400" /> {t('title')}
          </DialogTitle>
          <p className="text-slate-400 text-[11px] font-bold mt-1">{user.user_name}</p>
        </DialogHeader>

        <div className="p-6 flex-1 overflow-y-auto min-h-[380px]">
          {loading || !status ? (
            <div className="h-full min-h-[332px] flex items-center justify-center text-slate-400">
              {loading ? <Loader2 size={32} className="animate-spin" /> : <p className="text-sm">{t('loadFailed')}</p>}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {isVisible ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 size={13} /> {t('visible')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                    <CircleAlert size={13} /> {t('hidden')}
                  </span>
                )}
                {status.isDemo && <span className="text-xs text-slate-500">{t('demoNote')}</span>}
              </div>

              <section className="space-y-1.5">
                <h3 className="text-xs font-bold text-slate-600">{t('requiredItemsLabel')}</h3>
                {status.missingItems.length === 0 ? (
                  <p className="text-sm text-slate-700">{t('requiredItemsComplete')}</p>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <p className="text-xs font-bold">{t('requiredItemsMissing')}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {status.missingItems.map((item) => (
                        <li key={item}>{t(`items.${item}`)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="space-y-1.5">
                <h3 className="text-xs font-bold text-slate-600">{t('acceptingLabel')}</h3>
                <p className="text-sm text-slate-700">{status.acceptingStudents ? t('acceptingOn') : t('acceptingOff')}</p>
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <label htmlFor={`matching-suspend-${user.id}`} className="text-sm font-bold text-slate-700">
                      {t('suspendLabel')}
                    </label>
                    <p className="text-xs text-slate-500">{t('suspendDescription')}</p>
                  </div>
                  <Switch id={`matching-suspend-${user.id}`} checked={suspended} onCheckedChange={setSuspended} />
                </div>
                {status.isSuspended && status.suspendedAt && (
                  <p className="text-xs text-slate-500">{t('suspendedSince', { date: formatDateTimeByZone(status.suspendedAt) })}</p>
                )}
                {suspended && (
                  <div className="space-y-1.5">
                    <label htmlFor={`matching-note-${user.id}`} className="text-xs font-bold text-slate-600">
                      {t('noteLabel')}
                    </label>
                    <Textarea
                      id={`matching-note-${user.id}`}
                      rows={3}
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('notePlaceholder')}
                    />
                  </div>
                )}
              </section>

              <Button type="button" onClick={handleSave} pending={isSaving} className="w-full">
                {tCommon('save')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
