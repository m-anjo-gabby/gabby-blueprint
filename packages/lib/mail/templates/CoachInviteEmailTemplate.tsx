// packages/lib/mail/templates/CoachInviteEmailTemplate.tsx
import * as React from 'react';

interface CoachInviteEmailTemplateProps {
  userName: string;
  inviteUrl: string;
  expiresDays: number;
}

export const CoachInviteEmailTemplate: React.FC<CoachInviteEmailTemplateProps> = ({
  userName,
  inviteUrl,
  expiresDays,
}) => {
  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#f4f5f7',
      color: '#333333',
      margin: 0,
      padding: '0 0 40px 0',
      width: '100%',
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '40px auto 0 auto',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      }}>
        {/* Header */}
        <div style={{ backgroundColor: '#0f172a', padding: '32px', textAlign: 'center' }}>
          <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            Gabby Blueprint English
          </h1>
          <p style={{ color: '#818cf8', margin: '4px 0 0 0', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.08em' }}>
            COACH PORTAL
          </p>
        </div>

        {/* Main content */}
        <div style={{ padding: '40px 32px', lineHeight: '1.6' }}>
          <p style={{ fontSize: '16px', margin: '0 0 20px 0', fontWeight: 'bold' }}>
            {userName ? `Dear ${userName},` : 'Dear Coach,'}
          </p>

          <p style={{ fontSize: '16px', margin: '0 0 20px 0' }}>
            You have been invited to join the Gabby Blueprint English <strong>Coach Portal</strong>.<br />
            As a coach, you will be able to support learners and manage your coaching activities here.
          </p>
          <p style={{ fontSize: '16px', margin: '0 0 20px 0' }}>
            Your registration is not yet complete. Please click the button below to verify your email address and <strong>set your password</strong> to activate your account.
          </p>

          {/* Button */}
          <div style={{ textAlign: 'center', margin: '32px 0' }}>
            <a
              href={inviteUrl}
              style={{
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '14px 36px',
                borderRadius: '6px',
                fontWeight: 'bold',
                display: 'inline-block',
                fontSize: '16px',
                boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.25)',
              }}
            >
              Verify Email &amp; Set Password
            </a>
          </div>

          {/* Fallback link for mail clients that block HTML buttons */}
          <div style={{ textAlign: 'center', margin: '0 0 32px 0', padding: '0 16px' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px 0' }}>
              If the button above does not work, please complete your registration using the link below.
            </p>
            <p style={{ fontSize: '13px', margin: 0, wordBreak: 'break-all' }}>
              <a href={inviteUrl} style={{ color: '#4f46e5', textDecoration: 'underline' }}>
                {inviteUrl}
              </a>
            </p>
          </div>

          {/* Notice */}
          <div style={{
            backgroundColor: '#fffbeb',
            borderLeft: '4px solid #f59e0b',
            padding: '16px',
            margin: '32px 0 0 0',
          }}>
            <p style={{ fontSize: '13px', color: '#b45309', margin: 0 }}>
              <strong>⚠️ Link expiration notice</strong><br />
              This invitation link will expire <strong>{expiresDays} day(s)</strong> after it was sent. If it has expired, please contact your administrator to request a new invitation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          padding: '32px 24px',
          fontSize: '12px',
          color: '#9ca3af',
          backgroundColor: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
        }}>
          <p style={{ margin: '0 0 8px 0', lineHeight: '1.5' }}>
            <strong>Support</strong><br />
            Gabby Blueprint Support Desk:{' '}
            <a href="mailto:support@gabbyacademy.com" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              support@gabbyacademy.com
            </a>
          </p>
          <p style={{ marginTop: '16px', marginBottom: '8px' }}>
            <strong>Gabby Academy Co., Ltd.</strong><br />
            <a href="https://gabbyacademy.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              https://gabbyacademy.com/
            </a>
          </p>
          <p style={{ marginTop: '24px', marginBottom: 0 }}>&copy; Gabby All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};
