'use client';

import { ArrowLeft, Send } from 'lucide-react';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import {
  formatTrialApplicantName,
  formatTrialApplicantNameLatin,
  formatTrialOccupation,
  formatTrialReferralSource,
  TRIAL_OCCUPATION_OTHER,
  TRIAL_REFERRAL_SOURCE_OTHER,
} from '@gabby/types/trialApplication';
import { submitTrial } from '@/actions/trialAction';
import { Button } from '@/components/ui/button';
import type { TrialApplicationFormValues } from '../_lib/schema';
import { TurnstileWidget, type TurnstileWidgetHandle } from './TurnstileWidget';

interface TrialApplicationConfirmProps {
  /** 入力画面で検証済みの値 */
  values: TrialApplicationFormValues;
  /** 選んだタイムゾーンの表示名 */
  timezoneLabel: string;
  turnstileSiteKey: string;
  /** 「修正する」（入力内容を残したまま入力画面へ戻る） */
  onBack: () => void;
  /** 受付が完了した */
  onComplete: () => void;
}

/**
 * Webトライアルの申込の確認画面。入力内容と、氏名が登録後にどう使われるか（正式な氏名・コーチに表示される名前）を見せてから送る。
 * CAPTCHA は送信の直前に通すため、この画面に置く（トークンは約5分で期限が切れ、1回しか使えない）。
 */
export function TrialApplicationConfirm({
  values,
  timezoneLabel,
  turnstileSiteKey,
  onBack,
  onComplete,
}: TrialApplicationConfirmProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const occupation = Number(values.occupation);
  const referralSource = Number(values.referralSource);

  const handleSubmit = () => {
    if (!turnstileToken) {
      setSubmitError('「人間であることを確認します」のチェックを完了してください。');
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitTrial(values, turnstileToken);
      if (result.success) {
        onComplete();
        return;
      }
      setSubmitError(result.error);
      turnstileRef.current?.reset();
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-bold text-ink">入力内容のご確認</h2>
        <p className="text-sm text-ink-muted">内容をご確認のうえ、「申し込む」を押してください。</p>
      </div>

      <dl className="divide-y divide-line rounded-card border border-line">
        <ConfirmRow label="メールアドレス">{values.email}</ConfirmRow>
        <ConfirmRow label="お名前">{formatTrialApplicantName(values)}</ConfirmRow>
        <ConfirmRow label="お名前（ローマ字）">
          姓 {values.lastNameLatin} / 名 {values.firstNameLatin}
        </ConfirmRow>
        <ConfirmRow label="業種・職業">
          {formatTrialOccupation(occupation, occupation === TRIAL_OCCUPATION_OTHER ? values.occupationOther : null)}
        </ConfirmRow>
        <ConfirmRow label="お住まいの地域のタイムゾーン">{timezoneLabel}</ConfirmRow>
        <ConfirmRow label="国・都市">{values.countryCity || <NotEntered />}</ConfirmRow>
        <ConfirmRow label="Gabby をどこで知りましたか？">
          {formatTrialReferralSource(
            referralSource,
            referralSource === TRIAL_REFERRAL_SOURCE_OTHER ? values.referralSourceOther : null,
          )}
        </ConfirmRow>
        <ConfirmRow label="ご要望・ご質問">
          {values.message ? (
            <span className="whitespace-pre-wrap wrap-anywhere">{values.message}</span>
          ) : (
            <NotEntered />
          )}
        </ConfirmRow>
      </dl>

      {/* 氏名の使われ方（ローマ字の誤りに気づいてもらうため、コーチに表示される名前を組み立てて見せる） */}
      <div className="space-y-2 rounded-card bg-brand-soft p-4 text-sm text-ink-soft">
        <p>
          コーチに表示されるお名前：
          <span className="font-bold text-ink" data-testid="trial-coach-display-name">
            {formatTrialApplicantNameLatin(values)}
          </span>
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">
          ご入力のお名前は、アプリでの表示や各種のご案内に使用します。
        </p>
      </div>

      <TurnstileWidget ref={turnstileRef} siteKey={turnstileSiteKey} onTokenChange={setTurnstileToken} />

      {submitError && (
        <p role="alert" className="rounded-control border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="button" variant="outline" size="lg" className="sm:flex-1" onClick={onBack} disabled={isPending}>
          <ArrowLeft aria-hidden />
          修正する
        </Button>
        <Button
          type="button"
          size="lg"
          className="sm:flex-1"
          onClick={handleSubmit}
          pending={isPending}
          icon={<Send aria-hidden />}
        >
          申し込む
        </Button>
      </div>
    </div>
  );
}

function ConfirmRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-xs font-bold text-ink-muted sm:text-sm">{label}</dt>
      <dd className="break-all text-sm text-ink">{children}</dd>
    </div>
  );
}

const NotEntered = () => <span className="text-ink-subtle">未入力</span>;
