import type { MailDocument } from '../layout/document';
import { supportFooter } from '../layout/footers';

/** コーチ向け招待メール（英語） */
export interface CoachInviteEmailTemplateProps {
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}

export const COACH_INVITATION_SUBJECT = '[Gabby Blueprint] Coach Account Invitation';

export function buildCoachInviteMail({ userName, inviteUrl, expiresDays }: CoachInviteEmailTemplateProps): MailDocument {
  return {
    language: 'en',
    preheader: 'You have been invited to the Gabby Blueprint English Coach Portal.',
    headerLabel: 'Coach Portal',
    blocks: [
      { kind: 'paragraph', text: userName ? `Dear ${userName},` : 'Dear Coach,', strong: true },
      {
        kind: 'paragraph',
        text: 'You have been invited to join the Gabby Blueprint English Coach Portal.\nAs a coach, you will be able to support learners and manage your coaching activities here.',
      },
      {
        kind: 'paragraph',
        text: 'Your registration is not yet complete. Please click the button below to verify your email address and set your password to activate your account.',
      },
      {
        kind: 'button',
        label: 'Verify email & set password',
        href: inviteUrl,
        fallback: ['If the button above does not work, please complete your registration using the link below.'],
      },
      {
        kind: 'notice',
        items: [
          {
            title: 'Link expiration',
            text: `This invitation link expires ${expiresDays} day${expiresDays === 1 ? '' : 's'} after it was sent. If it has expired, please contact your administrator to request a new invitation.`,
          },
        ],
      },
    ],
    footer: supportFooter(['en']),
  };
}
