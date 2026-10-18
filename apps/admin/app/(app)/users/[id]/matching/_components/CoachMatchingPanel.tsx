'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { isCoachMatchable } from '@gabby/lib/coachProfile/matchingReadiness';
import { type CoachMatchingStatus } from '@gabby/types/coachProfile';
import { setCoachMatchingSuspension } from '@/actions/adminCoachMatchingAction';

interface CoachMatchingPanelProps {
  coachId: string;
  status: CoachMatchingStatus;
}

/**
 * コーチのマッチング対象（アドミンのみ）。生徒の「専属コーチを探す」に出るかどうかの内訳
 * （必須項目・コーチ本人の受付）を表示し、アドミンによる休止（理由のメモ付き）を設定する。
 */
export function CoachMatchingPanel({ coachId, status }: CoachMatchingPanelProps) {
  const t = useTranslations('users.matching');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const router = useRouter();
  const [suspended, setSuspended] = useState(status.isSuspended);
  const [note, setNote] = useState(status.suspendedNote ?? '');
  const [isSaving, startSave] = useTransition();

  const handleSave = () => {
    startSave(async () => {
      // 通信の失敗等は戻り値ではなく例外になる（そのままでは画面全体のエラー表示になる）ため、失敗として扱う
      const result = await setCoachMatchingSuspension(coachId, suspended, suspended ? note.trim() || null : null).catch(
        () => null,
      );
      if (!result) {
        showToast(tCommon('networkError'), 'error');
        return;
      }
      if (!result.success) {
        showToast(t('errorSave'), 'error');
        return;
      }
      showToast(suspended ? t('toastSuspended') : t('toastResumed'), 'success');
      // 休止の開始日時の表示を取り直す
      router.refresh();
    });
  };

  const isVisible = isCoachMatchable({ ...status, isSuspended: suspended });

  return (
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

      <div className="grid gap-5 md:grid-cols-2">
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
      </div>

      <section className="space-y-3 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="matching-suspend" className="text-sm font-bold text-slate-700">
              {t('suspendLabel')}
            </label>
            <p className="text-xs text-slate-500">{t('suspendDescription')}</p>
          </div>
          <Switch id="matching-suspend" checked={suspended} onCheckedChange={setSuspended} />
        </div>
        {status.isSuspended && status.suspendedAt && (
          <p className="text-xs text-slate-500">
            {t('suspendedSince', { date: formatDateTimeByZone(status.suspendedAt) })}
          </p>
        )}
        {suspended && (
          <div className="space-y-1.5">
            <label htmlFor="matching-note" className="text-xs font-bold text-slate-600">
              {t('noteLabel')}
            </label>
            <Textarea
              id="matching-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('notePlaceholder')}
            />
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} pending={isSaving} icon={<Save size={14} />}>
          {tCommon('save')}
        </Button>
      </div>
    </div>
  );
}
