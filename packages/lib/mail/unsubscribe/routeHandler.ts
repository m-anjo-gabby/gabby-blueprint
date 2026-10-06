import 'server-only';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { MAIL_CATEGORIES, isMailCategory } from '../dispatch/registry';
import { getUnsubscribeSecret, verifyUnsubscribeToken } from './token';

const logger = createLogger('mail');

/*
 * ログイン不要の配信停止の受け口（student・coach の app/mail/unsubscribe/route.ts から使う）。
 * - GET: 確認画面を出すだけで、停止はしない（メールのリンクを自動で開くセキュリティ製品で停止されないように）
 * - POST: 停止する（確認画面のボタン、またはメールソフトのワンクリック停止 List-Unsubscribe-Post）
 * 停止はプロフィールの「メール通知」と同じ設定（com_t_user_mail_setting）を、区分ごとにオフにする。
 */

type PageLanguage = 'ja' | 'en';

const COPY = {
  ja: {
    title: 'メールの配信停止',
    confirm: (label: string) => `「${label}」のメールの配信を停止します。よろしければ、下のボタンを押してください。`,
    button: '配信を停止する',
    done: (label: string) => `「${label}」のメールの配信を停止しました。アプリ内の通知は引き続き届きます。`,
    resume: '再開する場合は、アプリにログインし、プロフィールの「メール通知」から設定してください。',
    invalid: 'このリンクは無効です。お手数ですが、アプリにログインし、プロフィールの「メール通知」から設定してください。',
    failed: '配信停止の処理に失敗しました。時間をおいて再度お試しください。',
  },
  en: {
    title: 'Unsubscribe',
    confirm: (label: string) => `You are about to unsubscribe from "${label}" emails. Press the button below to confirm.`,
    button: 'Unsubscribe',
    done: (label: string) => `You have been unsubscribed from "${label}" emails. In-app notifications will still be delivered.`,
    resume: 'To turn them back on, sign in and go to "Email notifications" in your profile.',
    invalid: 'This link is invalid. Please sign in and change your settings under "Email notifications" in your profile.',
    failed: 'We could not process your request. Please try again later.',
  },
} as const;

function page(language: PageLanguage, body: string, status = 200): Response {
  const copy = COPY[language];
  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${copy.title} | Gabby Blueprint English</title>
</head>
<body style="margin:0;padding:48px 16px;background:#f4f5f7;font-family:'Helvetica Neue',Arial,'Hiragino Sans',Meiryo,sans-serif;color:#333333;">
<main style="max-width:480px;margin:0 auto;background:#ffffff;border-top:4px solid #0e3196;border-radius:8px;padding:32px 24px;">
<p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#0e3196;">Gabby Blueprint English</p>
<h1 style="margin:0 0 20px 0;font-size:20px;">${copy.title}</h1>
${body}
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

const paragraph = (text: string) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;">${text}</p>`;

/** URL の宛先・区分・署名を照合する（照合できなければ null） */
function readRequest(req: Request): { userId: string; category: keyof typeof MAIL_CATEGORIES } | null {
  const secret = getUnsubscribeSecret();
  const params = new URL(req.url).searchParams;
  const userId = params.get('u');
  const category = params.get('c');
  const token = params.get('t');
  if (!secret || !userId || !category || !token || !isMailCategory(category)) return null;
  if (!verifyUnsubscribeToken({ userId, category, token, secret })) return null;
  return { userId, category };
}

export function createUnsubscribeRoute(language: PageLanguage) {
  const copy = COPY[language];

  async function GET(req: Request): Promise<Response> {
    const target = readRequest(req);
    if (!target) return page(language, paragraph(copy.invalid), 400);
    const label = MAIL_CATEGORIES[target.category].labels[language].title;
    // action を省くと、同じ URL（クエリ付き）へ送信する
    return page(
      language,
      `${paragraph(copy.confirm(label))}
<form method="post">
<input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit" style="background:#0e3196;color:#ffffff;border:0;border-radius:6px;padding:12px 28px;font-size:15px;font-weight:bold;cursor:pointer;">${copy.button}</button>
</form>`
    );
  }

  async function POST(req: Request): Promise<Response> {
    const target = readRequest(req);
    if (!target) {
      logger.warn('mail:unsubscribe_invalid', 'Invalid unsubscribe request');
      return page(language, paragraph(copy.invalid), 400);
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('com_t_user_mail_setting')
      .upsert(
        { user_id: target.userId, category: target.category, enabled: false, update_date: new Date().toISOString() },
        { onConflict: 'user_id,category' }
      );
    if (error) {
      logger.error('mail:unsubscribe_failed', error.message, { userId: target.userId, payload: { category: target.category } });
      return page(language, paragraph(copy.failed), 500);
    }

    logger.info('mail:unsubscribe_success', 'Unsubscribed via email link', { userId: target.userId, payload: { category: target.category } });
    const label = MAIL_CATEGORIES[target.category].labels[language].title;
    return page(language, `${paragraph(copy.done(label))}${paragraph(copy.resume)}`);
  }

  return { GET, POST };
}
