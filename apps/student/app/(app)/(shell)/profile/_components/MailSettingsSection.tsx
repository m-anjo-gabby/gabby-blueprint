'use client';

import { useState } from 'react';
import { ACTIVE_MAIL_CATEGORIES, MAIL_CATEGORIES, type MailCategory } from '@gabby/lib/mail/dispatch/registry';
import type { MailSettings } from '@gabby/lib/mail/settingsActions';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { updateMyMailSetting } from '@/actions/mailSettingAction';
import { ProfileSection } from './ProfileSection';

const SECTION_TITLE = 'メール通知';
const NOTE = 'メールを停止しても、アプリ内の通知は届きます。アカウントに関するメール（パスワードの再設定など）は停止できません。';

function MailSettingRow({ category, children }: { category: MailCategory; children: React.ReactNode }) {
  const { title, description } = MAIL_CATEGORIES[category].labels.ja;
  const id = `mail-setting-${category}`;
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-bold text-ink">
          {title}
        </label>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * メール通知の設定（区分ごとに配信・停止。メールが1種類以上ある区分だけを出す）。
 * 切り替えはその場で保存し、失敗したら元に戻す。
 */
export function MailSettingsSection({ initialSettings }: { initialSettings: MailSettings | null }) {
  const [settings, setSettings] = useState<MailSettings | null>(initialSettings);
  const [savingCategory, setSavingCategory] = useState<MailCategory | null>(null);
  const { showToast } = useToast();

  if (ACTIVE_MAIL_CATEGORIES.length === 0) return null;

  const handleChange = async (category: MailCategory, enabled: boolean) => {
    setSettings((prev) => ({ ...prev, [category]: enabled }));
    setSavingCategory(category);
    const result = await updateMyMailSetting(category, enabled);
    setSavingCategory(null);
    if (!result.success) {
      setSettings((prev) => ({ ...prev, [category]: !enabled }));
      showToast(result.message, 'error');
      return;
    }
    showToast(enabled ? 'メールの配信を再開しました' : 'メールの配信を停止しました', 'success');
  };

  return (
    <ProfileSection title={SECTION_TITLE}>
      {settings ? (
        <div className="divide-y divide-line">
          {ACTIVE_MAIL_CATEGORIES.map((category) => (
            <MailSettingRow key={category} category={category}>
              <Switch
                id={`mail-setting-${category}`}
                checked={settings[category] ?? true}
                disabled={savingCategory === category}
                onCheckedChange={(checked) => handleChange(category, checked)}
              />
            </MailSettingRow>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">メール通知の設定を取得できませんでした。時間を置いて再度お試しください。</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">{NOTE}</p>
    </ProfileSection>
  );
}

/** メール通知の設定の骨組み（見出し・項目名は本物、切り替えだけ骨組み） */
export function MailSettingsSectionSkeleton() {
  if (ACTIVE_MAIL_CATEGORIES.length === 0) return null;
  return (
    <ProfileSection title={SECTION_TITLE}>
      <div className="divide-y divide-line">
        {ACTIVE_MAIL_CATEGORIES.map((category) => (
          <MailSettingRow key={category} category={category}>
            <Skeleton className="h-5 w-9 rounded-full" />
          </MailSettingRow>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">{NOTE}</p>
    </ProfileSection>
  );
}
