/**
 * Webトライアルの申込の受付（サーバー専用）。申込フォーム（student /trial）のサーバーアクションから呼ぶ。
 * 申込の記録・招待・管理者への通知は fn_submit_trial_application が1トランザクションで行い、
 * ここでは戻り値の種類に合わせてメールを送る（申込者への案内・サポート窓口への通知）。
 * メールの送信に失敗しても申込は受け付ける（申込は記録済みで、管理者にはアプリ内の通知が届いている）。
 *
 * 💡 'use server' は付けない（外部から直接呼べるエンドポイントにしないため）。
 */
import 'server-only';
import { randomBytes } from 'crypto';
import { formatTrialApplicantName, type TrialApplicationInput, type TrialApplicationKind } from '@gabby/types/trialApplication';
import { createAdminClient } from '../supabase/admin';
import { createLogger, type LogContext } from '../logger';
import { REPORTING_TIMEZONE } from '../date/reporting';
import { INVITATION_EXPIRES_DAYS, sendAccountMail } from '../mail/actions/sendAccountMail';
import {
  buildTrialAlreadyRegisteredMail,
  buildTrialApplicationNotifyMail,
  buildTrialInviteMail,
} from '../mail/templates/TrialEmailTemplates';

const logger = createLogger('common');

type AdminClient = ReturnType<typeof createAdminClient>;

interface SubmitRow {
  kind: TrialApplicationKind | null;
  application_id: string;
  apply_count: number;
  invitation_token: string | null;
  throttled: boolean;
}

/** サポート窓口のアドレス（student の環境変数 MAIL_TRIAL_APPLICATION_TO、カンマ区切り。未設定なら送らない） */
function supportRecipients(): string[] {
  return (process.env.MAIL_TRIAL_APPLICATION_TO ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

/** 本アプリ（student）の URL */
const studentUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? '';

function formatJstDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: REPORTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

async function timezoneLabel(supabase: AdminClient, timezone: string): Promise<string> {
  const { data } = await supabase.from('com_m_timezone').select('display_name_ja, display_name_en').eq('timezone', timezone).maybeSingle();
  return data ? `${data.display_name_ja} / ${data.display_name_en}` : timezone;
}

/** 申込者への案内（新規・再申込: パスワード設定の案内 / 登録済み: ログインの案内 / 招待中: 送らない） */
async function sendApplicantMail(supabase: AdminClient, input: TrialApplicationInput, row: SubmitRow) {
  if ((row.kind === 'new' || row.kind === 'reapply') && row.invitation_token) {
    const result = await sendAccountMail({
      to: input.email,
      kind: 'account_invite_trial',
      mail: buildTrialInviteMail({
        userName: formatTrialApplicantName(input),
        inviteUrl: `${studentUrl()}/auth/invite?token=${row.invitation_token}`,
        expiresDays: INVITATION_EXPIRES_DAYS,
      }),
      logName: 'send_trial_invitation',
      label: 'トライアルの招待メール',
    });
    // 管理者の招待と同じく、送信の結果を招待に記録する（失敗は admin のユーザー管理から再送できる）
    await supabase
      .from('com_t_invitation')
      .update({
        mail_sent_at: result.success ? new Date().toISOString() : null,
        last_mail_error: result.success ? null : (result.error ?? 'Unknown Error'),
      })
      .eq('token', row.invitation_token);
    return;
  }
  if (row.kind === 'registered') {
    await sendAccountMail({
      to: input.email,
      kind: 'account_trial_registered',
      mail: buildTrialAlreadyRegisteredMail({
        userName: formatTrialApplicantName(input),
        loginUrl: `${studentUrl()}/login`,
        forgotPasswordUrl: `${studentUrl()}/forgot-password`,
      }),
      logName: 'send_trial_registered_guide',
      label: 'トライアルの登録済みの案内メール',
    });
  }
}

/** サポート窓口への通知 */
async function sendSupportMail(supabase: AdminClient, input: TrialApplicationInput, row: SubmitRow, appliedAt: Date) {
  const recipients = supportRecipients();
  if (recipients.length === 0 || !row.kind) return;
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
  const mail = buildTrialApplicationNotifyMail({
    input,
    kind: row.kind,
    applyCount: row.apply_count,
    timezoneLabel: await timezoneLabel(supabase, input.timezone),
    appliedAt: formatJstDateTime(appliedAt),
    adminUrl: adminUrl ? `${adminUrl}/trial-applications` : null,
  });
  await Promise.all(
    recipients.map((to) =>
      sendAccountMail({ to, kind: 'trial_application_notify', mail, logName: 'send_trial_application_notify', label: 'トライアルの申込の通知メール' })
    )
  );
}

export type SubmitTrialApplicationResult = { success: true } | { success: false };

/**
 * 申込を受け付ける（入力は検証済み・メールアドレスは小文字にそろえて渡す）。
 * 申込者には申込の種類（登録済み等）を画面で知らせない（アドレスの登録の有無が分からないよう、常に同じ完了表示にする）。
 */
export async function submitTrialApplication(input: TrialApplicationInput, ctx: LogContext): Promise<SubmitTrialApplicationResult> {
  const supabase = createAdminClient();
  const appliedAt = new Date();
  const expiresAt = new Date(appliedAt.getTime() + INVITATION_EXPIRES_DAYS * 86_400_000);

  const { data, error } = await supabase.rpc('fn_submit_trial_application', {
    p_email: input.email,
    p_last_name: input.lastName,
    p_first_name: input.firstName,
    p_last_name_latin: input.lastNameLatin,
    p_first_name_latin: input.firstNameLatin,
    p_timezone: input.timezone,
    p_country_city: input.countryCity,
    p_occupation: input.occupation,
    p_occupation_other: input.occupationOther,
    p_message: input.message,
    p_token: randomBytes(32).toString('hex'),
    p_expires_at: expiresAt.toISOString(),
  });
  const row = (data as SubmitRow[] | null)?.[0];
  if (error || !row) {
    logger.error('trial:submit_application_failed', error?.message ?? 'No result', { ...ctx, err: error });
    return { success: false };
  }

  const logPayload = { applicationId: row.application_id, kind: row.kind, applyCount: row.apply_count };
  if (row.throttled) {
    logger.info('trial:submit_application_throttled', 'Repeated application within the minimum interval', { ...ctx, payload: logPayload });
    return { success: true };
  }

  await Promise.all([sendApplicantMail(supabase, input, row), sendSupportMail(supabase, input, row, appliedAt)]);
  logger.info('trial:submit_application_success', 'Trial application received', { ...ctx, payload: logPayload });
  return { success: true };
}
