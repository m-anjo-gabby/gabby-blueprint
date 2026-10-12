'use client';

import { useState } from 'react';
import { ACTIVE_MAIL_CATEGORIES, MAIL_CATEGORIES, type MailCategory } from '@gabby/lib/mail/dispatch/registry';
import type { MailSettings } from '@gabby/lib/mail/settingsActions';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Switch } from '@/components/ui/switch';
import { updateMyMailSetting } from '@/actions/mailSettingAction';

/**
 * Email notification settings (one switch per category that has at least one email type).
 * Each change is saved immediately and reverted if saving fails.
 */
export function MailSettingsCard({ initialSettings }: { initialSettings: MailSettings | null }) {
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
    showToast(enabled ? 'Email notifications turned on' : 'Email notifications turned off', 'success');
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <h2 className="text-[15px] font-bold text-slate-800">Email notifications</h2>
      {settings ? (
        <div className="mt-2 divide-y divide-slate-100">
          {ACTIVE_MAIL_CATEGORIES.map((category) => {
            const { title, description } = MAIL_CATEGORIES[category].labels.en;
            const id = `mail-setting-${category}`;
            return (
              <div key={category} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <label htmlFor={id} className="text-sm font-bold text-slate-700">
                    {title}
                  </label>
                  <p className="text-xs text-slate-500">{description}</p>
                </div>
                <Switch
                  id={id}
                  checked={settings[category] ?? true}
                  disabled={savingCategory === category}
                  onCheckedChange={(checked) => handleChange(category, checked)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Could not load your email notification settings. Please try again later.</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        In-app notifications are still delivered when emails are turned off. Account emails (such as password resets) cannot be turned off.
      </p>
    </section>
  );
}
