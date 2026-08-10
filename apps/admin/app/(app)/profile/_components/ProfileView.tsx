'use client';

import { useState } from 'react';
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
    showToast('プロフィールアイコンを更新しました', 'success');
  };

  const handleRemove = async () => {
    const result = await removeProfileIcon();
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIconPath(null);
    if (user) setUser({ ...user, icon_path: null });
    showToast('プロフィールアイコンを削除しました', 'success');
  };

  const handleTimezoneChange = async (next: string) => {
    const result = await updateMyTimezone(next);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setTimezone(result.timezone);
    if (user) setUser({ ...user, timezone: result.timezone });
    showToast('タイムゾーンを更新しました', 'success');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>アカウント情報</CardTitle>
        <CardDescription>アイコン画像はここから変更できます。名前は変更できません。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AvatarCropUploader
          currentImageUrl={getProfileIconUrl(iconPath)}
          onUpload={handleUpload}
          onRemove={handleRemove}
          labels={{
            modalTitle: 'アイコン画像を調整',
            cancelLabel: 'キャンセル',
            applyLabel: '保存する',
            uploadingLabel: '保存中...',
            removeLabel: '画像を削除',
            invalidFileLabel: 'PNG・JPEG・WebP形式、5MB以下の画像を選択してください。',
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>名前</Label>
            <Input value={userName} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>所属</Label>
            <Input value={clientName ?? '-'} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>権限区分</Label>
            <Input value={userTypeLabel} disabled />
          </div>
          <div className="space-y-1.5">
            <TimezoneSelector
              value={timezone}
              timezones={timezones}
              onChange={handleTimezoneChange}
              displayField="display_name_ja"
              labels={{ label: 'タイムゾーン', currentTimeLabel: '現在の日時' }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
