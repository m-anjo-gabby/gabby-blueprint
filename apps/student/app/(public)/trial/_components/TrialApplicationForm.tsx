'use client';

import { useRef, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ExternalLink, Send } from 'lucide-react';
import { PRIVACY_POLICY_URL } from '@gabby/lib/contact';
import { TRIAL_FIELD_LIMITS, TRIAL_OCCUPATION_OTHER, TRIAL_OCCUPATIONS } from '@gabby/types/trialApplication';
import { submitTrial } from '@/actions/trialAction';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TRIAL_FORM_DEFAULTS, trialApplicationSchema, type TrialApplicationFormValues } from '../_lib/schema';
import { TurnstileWidget, type TurnstileWidgetHandle } from './TurnstileWidget';

export interface TrialTimezoneOption {
  value: string;
  label: string;
}

interface TrialApplicationFormProps {
  timezones: TrialTimezoneOption[];
  turnstileSiteKey: string;
}

const Required = () => <span className="ml-1 text-xs text-rose-600">必須</span>;

export function TrialApplicationForm({ timezones, turnstileSiteKey }: TrialApplicationFormProps) {
  const form = useForm<TrialApplicationFormValues>({
    resolver: zodResolver(trialApplicationSchema),
    defaultValues: TRIAL_FORM_DEFAULTS,
  });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const isOtherOccupation = useWatch({ control: form.control, name: 'occupation' }) === String(TRIAL_OCCUPATION_OTHER);

  const onSubmit = (values: TrialApplicationFormValues) => {
    if (!turnstileToken) {
      setSubmitError('「人間であることを確認します」のチェックを完了してください。');
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitTrial(values, turnstileToken);
      if (result.success) {
        setSubmitted(true);
        return;
      }
      setSubmitError(result.error);
      turnstileRef.current?.reset();
    });
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center py-8 text-center" role="status">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden />
        </div>
        <h2 className="text-xl font-bold text-ink">お申し込みを受け付けました</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
          ご入力のメールアドレスに、ご案内のメールをお送りしました。メールの内容に沿って、トライアルを開始してください。
          <br />
          メールが届かない場合は、迷惑メールのフォルダもご確認ください。
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={(event) => form.handleSubmit(onSubmit)(event)} className="space-y-6" noValidate>
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

        <FormField
          control={form.control}
          name="userName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                氏名
                <Required />
              </FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="山田 太郎" maxLength={TRIAL_FIELD_LIMITS.userName} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="romajiLastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  姓（ローマ字）
                  <Required />
                </FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" placeholder="Yamada" maxLength={TRIAL_FIELD_LIMITS.romajiName} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="romajiFirstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  名（ローマ字）
                  <Required />
                </FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" placeholder="Taro" maxLength={TRIAL_FIELD_LIMITS.romajiName} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="occupation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                業種・職業
                <Required />
              </FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TRIAL_OCCUPATIONS.map((o) => (
                    <SelectItem key={o.code} value={String(o.code)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {isOtherOccupation && (
          <FormField
            control={form.control}
            name="occupationOther"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  業種・職業（その他）
                  <Required />
                </FormLabel>
                <FormControl>
                  <Input maxLength={TRIAL_FIELD_LIMITS.occupationOther} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
                <SelectContent>
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

        <TurnstileWidget ref={turnstileRef} siteKey={turnstileSiteKey} onTokenChange={setTurnstileToken} />

        {submitError && (
          <p role="alert" className="rounded-control border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
            {submitError}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" pending={isPending} icon={<Send aria-hidden />}>
          申し込む
        </Button>
      </form>
    </Form>
  );
}
