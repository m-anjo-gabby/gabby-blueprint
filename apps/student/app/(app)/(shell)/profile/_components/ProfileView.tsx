'use client';

import { useState } from 'react';
import { User as UserIcon, IdCard } from 'lucide-react';
import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { TimezoneSelector } from '@gabby/lib/components/common/TimezoneSelector';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { uploadProfileIcon, removeProfileIcon, updateMyTimezone } from '@/actions/studentProfileAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TimezoneMaster } from '@gabby/types/timezone';
import type { MailSettings } from '@gabby/lib/mail/settingsActions';
import { ProfileSection } from './ProfileSection';
import { AccountInfoRow, SecuritySection } from './ProfileParts';
import { MailSettingsSection } from './MailSettingsSection';

interface ProfileViewProps {
  userName: string;
  clientName: string | null;
  initialIconPath: string | null;
  initialTimezone: string;
  timezones: TimezoneMaster[];
  /** メール通知の設定（取得できない場合は null） */
  mailSettings: MailSettings | null;
}

/**
 * 生徒向けプロフィール設定画面
 * アイコン画像・アカウント情報・セキュリティをセクションカードで表示する構成とし、
 * 今後の設定項目追加（通知設定・言語設定 等）はセクションを追加するだけで拡張できるようにしている。
 */
export function ProfileView({ userName, clientName, initialIconPath, initialTimezone, timezones, mailSettings }: ProfileViewProps) {
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
    <div className="space-y-8">
      {/* アイコン画像セクション */}
      <ProfileSection title="アイコン画像">

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
            removeConfirmTitle: 'アイコン画像を削除しますか？',
            removeConfirmMessage: '削除すると元に戻せません。',
          }}
        />
      </ProfileSection>

      {/* アカウント情報セクション */}
      <ProfileSection title="アカウント情報">

        <dl className="space-y-1">
          <AccountInfoRow icon={UserIcon} label="名前">{userName}</AccountInfoRow>
          <AccountInfoRow icon={IdCard} label="所属">{clientName ?? '-'}</AccountInfoRow>
        </dl>

        <div className="pt-4 max-w-xs">
          <TimezoneSelector
            value={timezone}
            timezones={timezones}
            onChange={handleTimezoneChange}
            displayField="display_name_ja"
            labels={{ label: 'タイムゾーン', currentTimeLabel: '現在の日時' }}
          />
        </div>
      </ProfileSection>

      {/* メール通知セクション */}
      <MailSettingsSection initialSettings={mailSettings} />

      {/* セキュリティセクション */}
      <SecuritySection />
    </div>
  );
}
