import {
  formatTrialOccupation,
  WEB_TRIAL_LICENSE_DAYS,
  type TrialApplicationInput,
  type TrialApplicationKind,
} from '@gabby/types/trialApplication';
import { mailSubject, type MailContent } from '../layout/document';
import { supportFooter } from '../layout/footers';

/*
 * Webトライアルの申込のメール。
 * - 申込者へ: パスワード設定の案内（招待）/ 登録済みのアドレスへのログインの案内（日本語）
 * - サポート窓口へ: 申込の内容（日英併記。社内向け）
 */

/** 申込者へ: パスワード設定の案内（トライアル用の招待メール） */
export function buildTrialInviteMail({
  userName,
  inviteUrl,
  expiresDays,
}: {
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}): MailContent {
  return {
    subject: mailSubject('ja', 'Webトライアルのお申し込みありがとうございます'),
    doc: {
      language: 'ja',
      preheader: 'パスワードを設定して、Gabby Blueprint のトライアルを開始してください。',
      blocks: [
        { kind: 'paragraph', text: `${userName} 様`, strong: true },
        {
          kind: 'paragraph',
          text: 'Gabby Blueprint の Webトライアルにお申し込みいただき、ありがとうございます。\n以下のボタンからパスワードを設定すると、トライアルを開始できます。',
        },
        {
          kind: 'button',
          label: 'パスワードを設定してトライアルを開始する',
          href: inviteUrl,
          fallback: ['※ボタンがクリックできない場合は、以下のURLからパスワードを設定してください。'],
        },
        {
          kind: 'notice',
          items: [
            {
              title: 'トライアルの期間',
              text: `パスワードを設定した日から${WEB_TRIAL_LICENSE_DAYS}日間、アプリのトレーニングと、コーチとのライブセッション1回をご利用いただけます。`,
            },
            {
              title: 'リンクの有効期限について',
              text: `このリンクの有効期限は、メール送信から${expiresDays}日間です。期限が切れた場合は、お手数ですが再度お申し込みください。`,
            },
          ],
        },
      ],
      footer: supportFooter(['ja']),
    },
  };
}

/** 申込者へ: すでに登録済みのアドレスで申し込まれた場合のログインの案内 */
export function buildTrialAlreadyRegisteredMail({
  userName,
  loginUrl,
  forgotPasswordUrl,
}: {
  userName: string;
  loginUrl: string;
  forgotPasswordUrl: string;
}): MailContent {
  return {
    subject: mailSubject('ja', 'Webトライアルのお申し込みについて'),
    doc: {
      language: 'ja',
      preheader: 'このメールアドレスは、すでに Gabby Blueprint に登録されています。',
      blocks: [
        { kind: 'paragraph', text: `${userName} 様`, strong: true },
        {
          kind: 'paragraph',
          text: 'Webトライアルにお申し込みいただき、ありがとうございます。\nこのメールアドレスは、すでに Gabby Blueprint に登録されています。以下からログインしてご利用ください。',
        },
        { kind: 'button', label: 'ログインする', href: loginUrl },
        { kind: 'link', label: 'パスワードをお忘れの場合はこちら', href: forgotPasswordUrl },
        {
          kind: 'paragraph',
          text: 'お心当たりのない場合は、このメールを破棄してください。ご不明な点は下記のサポート窓口までお問い合わせください。',
          small: true,
          muted: true,
        },
      ],
      footer: supportFooter(['ja']),
    },
  };
}

const KIND_LABELS: Record<TrialApplicationKind, { ja: string; en: string; note: string | null }> = {
  new: { ja: '新規', en: 'New', note: null },
  reapply: {
    ja: '再申込',
    en: 'Re-application',
    note: 'パスワード設定前の再申込です。招待を出し直しました。 / Re-applied before setting a password. The invitation was re-issued.',
  },
  registered: {
    ja: '登録済みのアドレス',
    en: 'Already registered',
    note: 'このアドレスは登録済みのため、招待は作らず、本人にログインの案内を送りました。 / This address is already registered. No invitation was created; a login guide was sent to the applicant.',
  },
  invited: {
    ja: '招待中のアドレス',
    en: 'Already invited',
    note: 'このアドレスはトライアル以外の招待が有効なため、招待には触れていません。個別に対応してください。 / This address has another active invitation, which was left as is. Please follow up individually.',
  },
};

/** サポート窓口へ: 申込の内容（日英併記） */
export function buildTrialApplicationNotifyMail({
  input,
  kind,
  applyCount,
  timezoneLabel,
  appliedAt,
  adminUrl,
}: {
  input: TrialApplicationInput;
  kind: TrialApplicationKind;
  applyCount: number;
  timezoneLabel: string;
  /** 申込日時（日本時間の表示） */
  appliedAt: string;
  /** admin の申込一覧の URL（未設定なら載せない） */
  adminUrl: string | null;
}): MailContent {
  const label = KIND_LABELS[kind];
  const romaji = `${input.romajiLastName} ${input.romajiFirstName}`;
  return {
    subject: mailSubject('bilingual', `Webトライアルの申込（${label.ja}）/ Web trial application: ${input.userName}`),
    doc: {
      language: 'bilingual',
      preheader: `${input.userName}（${romaji}）/ ${formatTrialOccupation(input.occupation, input.occupationOther)}`,
      headerLabel: '運営 / Operations',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Webトライアルの申込がありました。\nA new web trial application has been received.',
        },
        ...(label.note ? [{ kind: 'notice' as const, items: [{ title: `${label.ja} / ${label.en}`, text: label.note }] }] : []),
        {
          kind: 'details',
          rows: [
            { label: '種類 / Type', value: `${label.ja} / ${label.en}`, sub: applyCount > 1 ? `${applyCount}回目 / #${applyCount}` : null },
            { label: '申込日時 / Applied at', value: `${appliedAt}（日本時間 / JST）` },
            { label: '氏名 / Name', value: input.userName, sub: romaji },
            { label: 'メール / Email', value: input.email },
            {
              label: '業種・職業 / Occupation',
              value: formatTrialOccupation(input.occupation, input.occupationOther),
              sub: formatTrialOccupation(input.occupation, input.occupationOther, 'en'),
            },
            { label: 'タイムゾーン / Time zone', value: timezoneLabel },
            { label: '国・都市 / Country, city', value: input.countryCity || '—' },
          ],
        },
        ...(input.message ? [{ kind: 'title' as const, text: 'ご要望・ご質問 / Message' }, { kind: 'quote' as const, text: input.message }] : []),
        ...(adminUrl ? [{ kind: 'button' as const, label: '申込一覧を開く / Open applications', href: adminUrl }] : []),
      ],
      footer: [
        {
          text: 'このメールは、Webトライアルの申込があるたびにサポート窓口へお送りしています。 / Sent to the support desk for each web trial application.',
        },
      ],
    },
  };
}
