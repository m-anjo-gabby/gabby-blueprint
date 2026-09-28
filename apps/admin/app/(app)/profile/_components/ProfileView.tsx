'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { TimezoneSelector } from '@gabby/lib/components/common/TimezoneSelector';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { uploadProfileIcon, removeProfileIcon, updateMyTimezone } from '@/actions/adminProfileAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TimezoneMaster } from '@gabby/types/timezone';

interface ProfileViewProps {
  userName: string;
  clientName: string | null;
  userTypeLabel: string;
  initialIconPath: string | null;
  initialTimezone: string;
  timezones: TimezoneMaster[];
}

export function ProfileView({ userName, clientName, userTypeLabel, initialIconPath, initialTimezone, timezones }: ProfileViewProps) {
  const t = useTranslations('profile.view');
  const locale = useLocale();
  const [iconPath, setIconPath] = useState(initialIconPath);
  const [timezone, setTimezone] = useState(initialTimezone);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const { showToast } = useToast();

  const handleUpload = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'icon.png');
    const result = await uploadProfileIcon(formData);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIconPath(result.iconPath);
    if (user) setUser({ ...user, icon_path: result.iconPath });
    showToast(t('toastIconUpdated'), 'success');
  };

  const handleRemove = async () => {
    const result = await removeProfileIcon();
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIconPath(null);
    if (user) setUser({ ...user, icon_path: null });
    showToast(t('toastIconRemoved'), 'success');
  };

  const handleTimezoneChange = async (next: string) => {
    const result = await updateMyTimezone(next);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setTimezone(result.timezone);
    if (user) setUser({ ...user, timezone: result.timezone });
    showToast(t('toastTimezoneUpdated'), 'success');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cardTitle')}</CardTitle>
        <CardDescription>{t('cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AvatarCropUploader
          currentImageUrl={getProfileIconUrl(iconPath)}
          onUpload={handleUpload}
          onRemove={handleRemove}
          labels={{
            modalTitle: t('uploader.modalTitle'),
            cancelLabel: t('uploader.cancelLabel'),
            applyLabel: t('uploader.applyLabel'),
            uploadingLabel: t('uploader.uploadingLabel'),
            removeLabel: t('uploader.removeLabel'),
            invalidFileLabel: t('uploader.invalidFileLabel'),
            removeConfirmTitle: t('uploader.removeConfirmTitle'),
            removeConfirmMessage: t('uploader.removeConfirmMessage'),
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('nameLabel')}</Label>
            <Input value={userName} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{t('affiliationLabel')}</Label>
            <Input value={clientName ?? '-'} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{t('roleTypeLabel')}</Label>
            <Input value={userTypeLabel} disabled />
          </div>
          <div className="space-y-1.5">
            <TimezoneSelector
              value={timezone}
              timezones={timezones}
              onChange={handleTimezoneChange}
              displayField={locale === 'en' ? 'display_name_en' : 'display_name_ja'}
              labels={{ label: t('timezoneLabel'), currentTimeLabel: t('currentTimeLabel') }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
