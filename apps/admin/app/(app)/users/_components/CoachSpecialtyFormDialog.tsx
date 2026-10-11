'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@gabby/lib/hooks/useToast';
import { COACH_SPECIALTY_FIELD_MAX, CoachSpecialtyMaster } from '@gabby/types/coachSpecialty';
import { UserRecord } from '@gabby/types/user';
import { getCoachSpecialtySettings, setCoachSpecialties } from '@/actions/adminCoachSpecialtyAction';

interface Props {
  user: UserRecord;
  children: React.ReactNode;
}

/**
 * コーチの専門の設定ダイアログ（アドミンのみ）。分野は COACH_SPECIALTY_FIELD_MAX 個まで、
 * 得意分野（発音プロ）は別枠で上限に数えない。保存はコーチ1人分をまとめて置き換える。
 */
export function CoachSpecialtyFormDialog({ user, children }: Props) {
  const t = useTranslations('users.specialty');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [master, setMaster] = useState<CoachSpecialtyMaster[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, startSave] = useTransition();

  const fields = master?.filter((s) => s.kind === 'field') ?? [];
  const skills = master?.filter((s) => s.kind === 'skill') ?? [];
  const selectedFieldCount = fields.filter((s) => selected.has(s.specialty_code)).length;
  const isFieldLimitReached = selectedFieldCount >= COACH_SPECIALTY_FIELD_MAX;

  const nameOf = (s: CoachSpecialtyMaster) => (locale === 'ja' ? s.name_ja : s.name_en);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setMaster(null);
      setSelected(new Set());
      return;
    }
    setLoading(true);
    try {
      const settings = await getCoachSpecialtySettings(user.id);
      if (!settings) {
        showToast(t('loadFailed'), 'error');
        return;
      }
      setMaster(settings.master);
      setSelected(new Set(settings.codes));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (code: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  };

  const handleSave = () => {
    startSave(async () => {
      const result = await setCoachSpecialties(user.id, [...selected]);
      if (!result.success) {
        showToast(
          result.errorCode === 'too_many_fields' ? t('errorTooMany', { max: COACH_SPECIALTY_FIELD_MAX }) : t('errorSave'),
          'error'
        );
        return;
      }
      showToast(t('toastSaved'), 'success');
      setOpen(false);
    });
  };

  const renderOption = (specialty: CoachSpecialtyMaster, disabled: boolean) => {
    const id = `specialty-${user.id}-${specialty.specialty_code}`;
    return (
      <label
        key={specialty.specialty_code}
        htmlFor={id}
        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
          disabled ? 'cursor-not-allowed border-slate-100 text-slate-300' : 'cursor-pointer border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Checkbox
          id={id}
          checked={selected.has(specialty.specialty_code)}
          onCheckedChange={(checked) => toggle(specialty.specialty_code, checked === true)}
          disabled={disabled}
        />
        {nameOf(specialty)}
      </label>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 shadow-2xl border-none [&>button]:text-white [&>button]:opacity-70 max-h-[90vh] flex flex-col rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Sparkles size={18} className="text-brand-400" /> {t('title')}
          </DialogTitle>
          <p className="text-slate-400 text-[11px] font-bold mt-1">{user.user_name}</p>
        </DialogHeader>

        <div className="p-6 flex-1 overflow-y-auto min-h-[380px]">
          {loading || !master ? (
            <div className="h-full min-h-[332px] flex items-center justify-center text-slate-400">
              {loading ? <Loader2 size={32} className="animate-spin" /> : <p className="text-sm">{t('loadFailed')}</p>}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">{t('description')}</p>

              <section className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-bold text-slate-600">{t('fieldsLabel', { max: COACH_SPECIALTY_FIELD_MAX })}</h3>
                  <span className={`text-xs font-bold tabular-nums ${isFieldLimitReached ? 'text-brand' : 'text-slate-400'}`}>
                    {t('fieldsCount', { count: selectedFieldCount, max: COACH_SPECIALTY_FIELD_MAX })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {fields.map((s) => renderOption(s, isFieldLimitReached && !selected.has(s.specialty_code)))}
                </div>
              </section>

              {skills.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-600">{t('skillsLabel')}</h3>
                  <div className="grid grid-cols-2 gap-2">{skills.map((s) => renderOption(s, false))}</div>
                </section>
              )}

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
