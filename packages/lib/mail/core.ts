// packages/lib/mail/core.ts
import 'server-only';
import { Resend, type WebhookEventPayload } from 'resend';
import type { RenderedEmail } from './render';
import { mailEnvironmentTag } from './webhook/mailEvent';

// APIキーがない（開発初期や未設定環境）場合はnullにしておき、関数内で安全にガード
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/** 送信の失敗（Resend のエラーコード。送信処理が再試行の扱いを決めるのに使う） */
export class MailSendError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly statusCode: number | null
  ) {
    super(message);
    this.name = 'MailSendError';
  }
}

interface SendCoreParams extends RenderedEmail {
  to: string;
  /**
   * 送信元の種類。auth=アカウント関連（招待・パスワード再設定）/ notify=通知・リマインダー。
   * 通知の送信元を分けておくと、通知の大量送信で評価が下がってもアカウント関連のメールの到達に影響しにくい。
   */
  sender?: 'auth' | 'notify';
  /** 追加のメールヘッダー（配信停止の List-Unsubscribe 等） */
  headers?: Record<string, string>;
  /**
   * メールの種類（Resend のタグ kind。到達状況の Webhook で、どのメールの出来事かを見分ける。英数字・_・- のみ）。
   * 例: account_invite / password_reset / 送信待ちの mail_type
   */
  kind: string;
  /** 送信待ちの行（Resend のタグ mail_id。Webhook で送信待ちの行に到達状況を記録する） */
  mailId?: string;
  /** 重複防止キー（同じキーの送信は Resend 側で24時間は1回にまとめる。送信待ちの再確保による二重送信を防ぐ） */
  idempotencyKey?: string;
}

const DEFAULT_FROM_AUTH = 'Gabby Academy <noreply@mail.gabbyacademy.com>';

/**
 * 🛠️ メール送信の共通基盤（コア）関数
 * HTML 版とテキスト版（render.ts で同じ元データから作ったもの）の両方を送る。
 */
export async function sendCore({ to, subject, html, text, sender = 'auth', headers, kind, mailId, idempotencyKey }: SendCoreParams) {
  if (!resend) {
    throw new MailSendError('mail:core: RESEND_API_KEY が環境変数に定義されていません。', 'missing_api_key', null);
  }

  // 送信元アドレス（先ほどの環境変数名に同期）
  const fromAuth = process.env.MAIL_FROM_AUTH || DEFAULT_FROM_AUTH;
  const from = sender === 'notify' ? process.env.MAIL_FROM_NOTIFY || fromAuth : fromAuth;
  const envTag = mailEnvironmentTag(process.env.NEXT_PUBLIC_SUPABASE_URL);

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject,
      html,
      text,
      headers,
      tags: [
        { name: 'kind', value: kind },
        ...(mailId ? [{ name: 'mail_id', value: mailId }] : []),
        // 送信した環境（Webhook で自分の環境のメールだけを記録するため。mailEvent.ts の mailEnvironmentTag）
        ...(envTag ? [{ name: 'env', value: envTag }] : []),
      ],
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  if (error) {
    throw new MailSendError(`mail:core:api_failed: ${error.message}`, error.name, error.statusCode);
  }

  return data;
}

/**
 * Resend の Webhook の署名を確かめ、出来事を取り出す（署名が合わない・古い場合は例外）。
 * 鍵は Resend の Webhook の設定画面の Signing Secret（環境変数 RESEND_WEBHOOK_SECRET）。
 */
export function verifyResendWebhook(options: {
  payload: string;
  headers: { id: string; timestamp: string; signature: string };
  webhookSecret: string;
}): WebhookEventPayload {
  if (!resend) {
    throw new MailSendError('mail:core: RESEND_API_KEY が環境変数に定義されていません。', 'missing_api_key', null);
  }
  return resend.webhooks.verify(options);
}
