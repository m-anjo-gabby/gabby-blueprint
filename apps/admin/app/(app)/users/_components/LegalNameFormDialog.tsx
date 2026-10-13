'use client';

import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { IdCard, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatLegalName } from '@gabby/lib/userLegal/formatLegalName';
import { LEGAL_NAME_MAX_LENGTH, type LegalName } from '@gabby/types/userLegal';
import { UserRecord } from '@gabby/types/user';
import { getUserLegalName, saveUserLegalName } from '@/actions/adminUserLegalAction';

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

const EMPTY_VALUES: LegalNameFormValues = { last_name: '', first_name: '', last_name_latin: '', first_name_latin: '' };

function toFormValues(name: LegalName | null): LegalNameFormValues {
  if (!name) return EMPTY_VALUES;
  return {
    last_name: name.last_name ?? '',
    first_name: name.first_name,
    last_name_latin: name.last_name_latin ?? '',
    first_name_latin: name.first_name_latin ?? '',
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
  user: UserRecord;
  children: React.ReactNode;
}

/**
 * 正式な氏名（書面に載せる氏名）の登録ダイアログ（生徒・コーチ共通、アドミンのみ）。
 * 入力欄は日本語の順（姓 → 名）に並べ、書面での並べ方（日本語・英語）を下に表示して確認できるようにする。
 * すべて空欄で保存すると未登録に戻る（書面には画面の名前が載る）。
 */
export function LegalNameFormDialog({ user, children }: Props) {
  const t = useTranslations('users.legal');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const schema = useMemo(() => createLegalNameSchema(t), [t]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const form = useForm<LegalNameFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });
  const preview = toLegalName(useWatch({ control: form.control }));

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setLoading(true);
    setLoadFailed(false);
    form.reset(EMPTY_VALUES);
    try {
      const result = await getUserLegalName(user.id);
      if (!result.success) {
        setLoadFailed(true);
        return;
      }
      form.reset(toFormValues(result.legalName));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: LegalNameFormValues) => {
    const result = await saveUserLegalName({ userId: user.id, ...values });
    if (!result.success) {
      showToast(t('errorSave'), 'error');
      return;
    }
    showToast(result.legalName ? t('toastSaved') : t('toastCleared'), 'success');
    setOpen(false);
  };

  const renderField = (name: keyof LegalNameFormValues, label: string, placeholder: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs font-bold text-slate-600">{label}</FormLabel>
          <FormControl>
            <Input {...field} placeholder={placeholder} className="rounded-xl border-slate-200 h-11" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 shadow-2xl border-none [&>button]:text-white [&>button]:opacity-70 max-h-[90vh] flex flex-col rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <IdCard size={18} className="text-brand-400" /> {t('title')}
          </DialogTitle>
          <p className="text-slate-400 text-[11px] font-bold mt-1">{user.user_name}</p>
        </DialogHeader>

        <div className="p-6 flex-1 overflow-y-auto min-h-[420px]">
          {loading || loadFailed ? (
            <div className="h-full min-h-[372px] flex items-center justify-center text-slate-400">
              {loading ? <Loader2 size={32} className="animate-spin" /> : <p className="text-sm">{t('loadFailed')}</p>}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <p className="text-xs text-slate-500">{t('description')}</p>

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

                <dl className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs space-y-1.5">
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-slate-500">{t('previewJa')}</dt>
                    <dd className="font-bold text-slate-800">{formatLegalName(preview, 'ja') ?? t('previewNotSet')}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-slate-500">{t('previewEn')}</dt>
                    <dd className="font-bold text-slate-800">{formatLegalName(preview, 'en') ?? t('previewNotSet')}</dd>
                  </div>
                </dl>

                <Button type="submit" pending={form.formState.isSubmitting} className="w-full">
                  {tCommon('save')}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
