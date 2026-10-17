'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { PRIVACY_POLICY_URL } from '@gabby/lib/contact';
import {
  TRIAL_FIELD_LIMITS,
  TRIAL_OCCUPATION_OTHER,
  TRIAL_OCCUPATIONS,
  TRIAL_REFERRAL_SOURCE_OTHER,
  TRIAL_REFERRAL_SOURCES,
} from '@gabby/types/trialApplication';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TRIAL_FORM_DEFAULTS, trialApplicationSchema, type TrialApplicationFormValues } from '../_lib/schema';
import { TrialApplicationConfirm } from './TrialApplicationConfirm';
import { TrialStepIndicator } from './TrialStepIndicator';

export interface TrialTimezoneOption {
  value: string;
  label: string;
}

interface TrialApplicationFormProps {
  timezones: TrialTimezoneOption[];
  turnstileSiteKey: string;
  /** 入力画面の先頭（段階表示の下）に出す案内（無料体験の内容の要約） */
  intro: ReactNode;
}

const Required = () => <span className="ml-1 text-xs text-rose-600">必須</span>;

interface NameFieldProps {
  control: Control<TrialApplicationFormValues>;
  name: 'lastName' | 'firstName' | 'lastNameLatin' | 'firstNameLatin';
  label: string;
  placeholder: string;
  autoComplete: string;
  maxLength: number;
}

/** 氏名の1欄（姓・名・それぞれのローマ字。いずれも必須） */
function NameField({ control, name, label, placeholder, autoComplete, maxLength }: NameFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            <Required />
          </FormLabel>
          <FormControl>
            <Input autoComplete={autoComplete} placeholder={placeholder} maxLength={maxLength} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface ChoiceWithOtherFieldProps {
  control: Control<TrialApplicationFormValues>;
  name: 'occupation' | 'referralSource';
  /** 「その他」を選んだ時に出す記入欄 */
  otherName: 'occupationOther' | 'referralSourceOther';
  label: string;
  choices: readonly { code: number; label: string }[];
  otherCode: number;
  otherMaxLength: number;
}

/** 選択肢（必須）と、「その他」を選んだ時だけ出る記入欄（必須。検証は schema.ts）の組 */
function ChoiceWithOtherField({ control, name, otherName, label, choices, otherCode, otherMaxLength }: ChoiceWithOtherFieldProps) {
  const isOther = useWatch({ control, name }) === String(otherCode);
  return (
    <>
      <FormField
        control={control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {label}
              <Required />
            </FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.code} value={String(choice.code)}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {isOther && (
        <FormField
          control={control}
          name={otherName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {`${label}（その他）`}
                <Required />
              </FormLabel>
              <FormControl>
                <Input maxLength={otherMaxLength} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
}

export function TrialApplicationForm({ timezones, turnstileSiteKey, intro }: TrialApplicationFormProps) {
  const form = useForm<TrialApplicationFormValues>({
    resolver: zodResolver(trialApplicationSchema),
    defaultValues: TRIAL_FORM_DEFAULTS,
  });
  const router = useRouter();
  // 確認画面に出す検証済みの値（null = 入力画面）。入力画面へ戻っても入力内容はフォームの状態に残る
  const [confirmValues, setConfirmValues] = useState<TrialApplicationFormValues | null>(null);

  // 確認画面の間は、ブラウザバック（確認画面へ進む時に積んだ履歴を戻る）で入力画面へ戻す
  useEffect(() => {
    if (!confirmValues) return;
    const handlePopState = () => {
      setConfirmValues(null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [confirmValues]);

  // 確認画面へ進む。URL は変えずに履歴を1つ積み、ブラウザバックを「修正する」と同じにする。
  // 表示を切り替えたら先頭から見せる（公開画面はページ全体がスクロールする）
  const showConfirm = (values: TrialApplicationFormValues) => {
    window.history.pushState(null, '', window.location.href);
    setConfirmValues(values);
    window.scrollTo({ top: 0 });
  };

  if (confirmValues) {
    return (
      <>
        <TrialStepIndicator current="confirm" />
        <TrialApplicationConfirm
          values={confirmValues}
          timezoneLabel={timezones.find((tz) => tz.value === confirmValues.timezone)?.label ?? confirmValues.timezone}
          turnstileSiteKey={turnstileSiteKey}
          // 積んだ履歴を戻る（上の popstate で入力画面になる）
          onBack={() => window.history.back()}
          // 確認画面の履歴を受付完了の画面に置き換える（再読み込みしても完了のまま、ブラウザバックで確認画面に戻らない）
          onComplete={() => router.replace('/trial/complete')}
        />
      </>
    );
  }

  return (
    <Form {...form}>
      <TrialStepIndicator current="input" />
      {intro}
      <form onSubmit={(event) => form.handleSubmit(showConfirm)(event)} className="space-y-6" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                メールアドレス
                <Required />
              </FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" maxLength={TRIAL_FIELD_LIMITS.email} {...field} />
              </FormControl>
              <FormDescription>パスワード設定のご案内をお送りします。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 氏名（姓・名）。正式な氏名として本登録時に登録し、ローマ字はコーチが見る名前（名 姓）にも使う */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          <NameField control={form.control} name="lastName" label="姓" placeholder="山田" autoComplete="family-name" maxLength={TRIAL_FIELD_LIMITS.name} />
          <NameField control={form.control} name="firstName" label="名" placeholder="太郎" autoComplete="given-name" maxLength={TRIAL_FIELD_LIMITS.name} />
          {/* ローマ字欄は漢字の自動入力が入らないよう autoComplete を切る */}
          <NameField control={form.control} name="lastNameLatin" label="姓（ローマ字）" placeholder="Yamada" autoComplete="off" maxLength={TRIAL_FIELD_LIMITS.latinName} />
          <NameField control={form.control} name="firstNameLatin" label="名（ローマ字）" placeholder="Taro" autoComplete="off" maxLength={TRIAL_FIELD_LIMITS.latinName} />
        </div>

        <ChoiceWithOtherField
          control={form.control}
          name="occupation"
          otherName="occupationOther"
          label="業種・職業"
          choices={TRIAL_OCCUPATIONS}
          otherCode={TRIAL_OCCUPATION_OTHER}
          otherMaxLength={TRIAL_FIELD_LIMITS.occupationOther}
        />

        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                お住まいの地域のタイムゾーン
                <Required />
              </FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                </FormControl>
                {/* 選択肢が多いため、7件強の高さに収めてスクロールさせる（続きがあることが分かるよう半件分のぞかせる） */}
                <SelectContent className="max-h-[min(15.5rem,var(--radix-select-content-available-height))]">
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>ライブセッションの日時の表示に使います。登録後に変更できます。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="countryCity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>国・都市</FormLabel>
              <FormControl>
                <Input placeholder="例: 日本・東京" maxLength={TRIAL_FIELD_LIMITS.countryCity} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ChoiceWithOtherField
          control={form.control}
          name="referralSource"
          otherName="referralSourceOther"
          label="Gabby をどこで知りましたか？"
          choices={TRIAL_REFERRAL_SOURCES}
          otherCode={TRIAL_REFERRAL_SOURCE_OTHER}
          otherMaxLength={TRIAL_FIELD_LIMITS.referralSourceOther}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ご要望・ご質問</FormLabel>
              <FormControl>
                <Textarea rows={4} maxLength={TRIAL_FIELD_LIMITS.message} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="agreePrivacy"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-3">
                <FormControl>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal leading-relaxed text-ink-soft">
                  <span>
                    <a
                      href={PRIVACY_POLICY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-bold text-brand underline underline-offset-2"
                    >
                      個人情報保護方針
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                    に同意する
                    <Required />
                  </span>
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="lg" className="w-full">
          入力内容を確認する
          <ArrowRight aria-hidden />
        </Button>
      </form>
    </Form>
  );
}
