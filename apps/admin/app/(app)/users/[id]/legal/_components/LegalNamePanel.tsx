'use client';

import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatLegalName } from '@gabby/lib/userLegal/formatLegalName';
import { LEGAL_NAME_MAX_LENGTH, type LegalName } from '@gabby/types/userLegal';
import { saveUserLegalName } from '@/actions/adminUserLegalAction';

type LegalT = ReturnType<typeof useTranslations<'users.legal'>>;

function createLegalNameSchema(t: LegalT) {
  const name = z.string().trim().max(LEGAL_NAME_MAX_LENGTH, t('errorTooLong', { max: LEGAL_NAME_MAX_LENGTH }));
  return z
    .object({ last_name: name, first_name: name, last_name_latin: name, first_name_latin: name })
    .superRefine((v, ctx) => {
      const hasAny = Object.values(v).some(Boolean);
      if (hasAny && !v.first_name) ctx.addIssue({ code: 'custom', message: t('errorFirstNameRequired'), path: ['first_name'] });
      if (v.last_name_latin && !v.first_name_latin) {
        ctx.addIssue({ code: 'custom', message: t('errorFirstNameRequired'), path: ['first_name_latin'] });
      }
    });
}

type LegalNameFormValues = z.infer<ReturnType<typeof createLegalNameSchema>>;

function toFormValues(name: LegalName | null): LegalNameFormValues {
  return {
    last_name: name?.last_name ?? '',
    first_name: name?.first_name ?? '',
    last_name_latin: name?.last_name_latin ?? '',
    first_name_latin: name?.first_name_latin ?? '',
  };
}

/** 入力中の値を書面での表示の確認用に LegalName にする（名が空なら未登録扱い） */
function toLegalName(v: Partial<LegalNameFormValues>): LegalName | null {
  if (!v.first_name?.trim()) return null;
  return {
    last_name: v.last_name || null,
    first_name: v.first_name,
    last_name_latin: v.last_name_latin || null,
    first_name_latin: v.first_name_latin || null,
  };
}

interface Props {
  userId: string;
  legalName: LegalName | null;
}

/**
 * 正式な氏名（書面に載せる氏名）の登録（生徒・コーチ共通、アドミンのみ）。
 * 入力欄は日本語の順（姓 → 名）に並べ、書面での並べ方（日本語・英語）を下に表示して確認できるようにする。
 * すべて空欄で保存すると未登録に戻る（書面には画面の名前が載る）。
 */
export function LegalNamePanel({ userId, legalName }: Props) {
  const t = useTranslations('users.legal');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const schema = useMemo(() => createLegalNameSchema(t), [t]);

  const form = useForm<LegalNameFormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(legalName) });
  const preview = toLegalName(useWatch({ control: form.control }));

  const onSubmit = async (values: LegalNameFormValues) => {
    const result = await saveUserLegalName({ userId, ...values });
    if (!result.success) {
      showToast(t('errorSave'), 'error');
      return;
    }
    showToast(result.legalName ? t('toastSaved') : t('toastCleared'), 'success');
    form.reset(toFormValues(result.legalName));
  };

  const renderField = (name: keyof LegalNameFormValues, label: string, placeholder: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs font-bold text-slate-600">{label}</FormLabel>
          <FormControl>
            <Input {...field} placeholder={placeholder} className="h-11 rounded-xl border-slate-200" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {renderField('last_name', t('lastName'), t('lastNamePlaceholder'))}
          {renderField('first_name', t('firstName'), t('firstNamePlaceholder'))}
        </div>

        <section className="space-y-2">
          <p className="text-xs text-slate-500">{t('latinDescription')}</p>
          <div className="grid grid-cols-2 gap-3">
            {renderField('last_name_latin', t('lastNameLatin'), t('lastNameLatinPlaceholder'))}
            {renderField('first_name_latin', t('firstNameLatin'), t('firstNameLatinPlaceholder'))}
          </div>
        </section>

        <dl className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-slate-500">{t('previewJa')}</dt>
            <dd className="font-bold text-slate-800">{formatLegalName(preview, 'ja') ?? t('previewNotSet')}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-slate-500">{t('previewEn')}</dt>
            <dd className="font-bold text-slate-800">{formatLegalName(preview, 'en') ?? t('previewNotSet')}</dd>
          </div>
        </dl>

        <div className="flex justify-end">
          <Button type="submit" pending={form.formState.isSubmitting} icon={<Save size={14} />} disabled={!form.formState.isDirty}>
            {tCommon('save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
