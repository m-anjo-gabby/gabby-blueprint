'use server';

import { getLogContext } from '@gabby/lib/logger/context';
import { verifyTurnstileToken } from '@gabby/lib/security/turnstile';
import { submitTrialApplication } from '@gabby/lib/trial/apply';
import { isTrialApplicationEnabled } from '@gabby/lib/trial/availability';
import {
  toTrialApplicationInput,
  trialApplicationSchema,
  type TrialApplicationFormValues,
} from '@/app/(public)/trial/_lib/schema';

export type SubmitTrialResult = { success: true } | { success: false; error: string };

/**
 * Webトライアルの申込（ログイン不要の公開フォーム /trial）。
 * CAPTCHA（Turnstile）と入力をサーバーで確かめてから受け付ける。申込の種類（登録済み等）は画面に返さない。
 */
export async function submitTrial(
  values: TrialApplicationFormValues,
  turnstileToken: string,
): Promise<SubmitTrialResult> {
  // 画面を通さずにアクションを直接呼ばれても、受付を止めている環境では受け付けない
  if (!isTrialApplicationEnabled()) {
    return { success: false, error: '現在、お申し込みを受け付けていません。' };
  }

  const ctx = await getLogContext();

  if (!(await verifyTurnstileToken(turnstileToken, ctx))) {
    return { success: false, error: '確認に失敗しました。お手数ですが、もう一度お試しください。' };
  }

  const parsed = trialApplicationSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const result = await submitTrialApplication(toTrialApplicationInput(parsed.data), ctx);
  if (!result.success) {
    return { success: false, error: 'お申し込みを受け付けられませんでした。時間をおいて、もう一度お試しください。' };
  }
  return { success: true };
}
