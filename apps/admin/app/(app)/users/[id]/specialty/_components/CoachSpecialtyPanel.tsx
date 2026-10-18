'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@gabby/lib/hooks/useToast';
import { COACH_SPECIALTY_FIELD_MAX, type CoachSpecialtyMaster } from '@gabby/types/coachSpecialty';
import { setCoachSpecialties, type CoachSpecialtySettings } from '@/actions/adminCoachSpecialtyAction';

interface Props {
  coachId: string;
  settings: CoachSpecialtySettings;
}

/**
 * コーチの専門の設定（アドミンのみ）。分野は COACH_SPECIALTY_FIELD_MAX 個まで、
 * 得意分野（発音プロ）は別枠で上限に数えない。保存はコーチ1人分をまとめて置き換える。
 */
export function CoachSpecialtyPanel({ coachId, settings }: Props) {
  const t = useTranslations('users.specialty');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(settings.codes));
  const [isSaving, startSave] = useTransition();

  const fields = settings.master.filter((s) => s.kind === 'field');
  const skills = settings.master.filter((s) => s.kind === 'skill');
  const selectedFieldCount = fields.filter((s) => selected.has(s.specialty_code)).length;
  const isFieldLimitReached = selectedFieldCount >= COACH_SPECIALTY_FIELD_MAX;

  const nameOf = (s: CoachSpecialtyMaster) => (locale === 'ja' ? s.name_ja : s.name_en);

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
      const result = await setCoachSpecialties(coachId, [...selected]);
      if (!result.success) {
        showToast(
          result.errorCode === 'too_many_fields'
            ? t('errorTooMany', { max: COACH_SPECIALTY_FIELD_MAX })
            : t('errorSave'),
          'error',
        );
        return;
      }
      showToast(t('toastSaved'), 'success');
    });
  };

  const renderOption = (specialty: CoachSpecialtyMaster, disabled: boolean) => {
    const id = `specialty-${specialty.specialty_code}`;
    return (
      <label
        key={specialty.specialty_code}
        htmlFor={id}
        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
          disabled
            ? 'cursor-not-allowed border-slate-100 text-slate-300'
            : 'cursor-pointer border-slate-200 text-slate-700 hover:bg-slate-50'
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
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-bold text-slate-600">{t('fieldsLabel', { max: COACH_SPECIALTY_FIELD_MAX })}</h3>
          <span className={`text-xs font-bold tabular-nums ${isFieldLimitReached ? 'text-brand' : 'text-slate-400'}`}>
            {t('fieldsCount', { count: selectedFieldCount, max: COACH_SPECIALTY_FIELD_MAX })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {fields.map((s) => renderOption(s, isFieldLimitReached && !selected.has(s.specialty_code)))}
        </div>
      </section>

      {skills.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-600">{t('skillsLabel')}</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{skills.map((s) => renderOption(s, false))}</div>
        </section>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} pending={isSaving} icon={<Save size={14} />}>
          {tCommon('save')}
        </Button>
      </div>
    </div>
  );
}
