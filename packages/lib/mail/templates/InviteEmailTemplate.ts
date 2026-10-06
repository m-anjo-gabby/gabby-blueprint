import type { MailDocument } from '../layout/document';
import { supportFooter } from '../layout/footers';

/** 生徒向け招待メール（日本語） */
export interface InviteEmailTemplateProps {
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}

export const STUDENT_INVITATION_SUBJECT = '【Gabby Blueprint】コーパス単語帳利用開始のご案内';

export function buildStudentInviteMail({ userName, inviteUrl, expiresDays }: InviteEmailTemplateProps): MailDocument {
  return {
    language: 'ja',
    preheader: 'Gabby Blueprint English へようこそ。パスワードを設定して利用を開始してください。',
    blocks: [
      { kind: 'paragraph', text: userName ? `${userName} 様` : '会員様', strong: true },
      { kind: 'paragraph', text: 'Gabby Blueprint English へようこそ！\nサポート窓口より、あなたのアカウントへの招待が届いています。' },
      {
        kind: 'paragraph',
        text: 'まだ本登録手続きは完了していません。以下のボタンをクリックしてメールアドレスを認証し、パスワードの設定へお進みください。',
      },
      {
        kind: 'button',
        label: 'メールを認証してパスワードを設定する',
        href: inviteUrl,
        fallback: ['※ボタンがクリックできない場合は、以下のURLからユーザー登録を完了させてください。'],
      },
      {
        kind: 'notice',
        items: [
          {
            title: 'リンクの有効期限について',
            text: `この招待リンクの有効期限は、メール送信から${expiresDays}日間です。期限が切れた場合はリンクが無効化されますので、お手数ですが下記のお問い合わせ先のサポート窓口まで再発行をご依頼ください。`,
          },
        ],
      },
    ],
    footer: supportFooter(['ja']),
  };
}
