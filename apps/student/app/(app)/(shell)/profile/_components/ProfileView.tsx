'use client';

import { useState } from 'react';
import Link from 'next/link';
import { User as UserIcon, IdCard, KeyRound, ChevronRight } from 'lucide-react';
import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { TimezoneSelector } from '@gabby/lib/components/common/TimezoneSelector';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { uploadProfileIcon, removeProfileIcon, updateMyTimezone } from '@/actions/studentProfileAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TimezoneMaster } from '@gabby/types/timezone';
import { ProfileSection } from './ProfileSection';

interface ProfileViewProps {
  userName: string;
  clientName: string | null;
  initialIconPath: string | null;
  initialTimezone: string;
  timezones: TimezoneMaster[];
}

/**
 * 生徒向けプロフィール設定画面
 * アイコン画像・アカウント情報・セキュリティをセクションカードで表示する構成とし、
 * 今後の設定項目追加（通知設定・言語設定 等）はセクションを追加するだけで拡張できるようにしている。
 */
export function ProfileView({ userName, clientName, initialIconPath, initialTimezone, timezones }: ProfileViewProps) {
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
          <div className="flex items-center justify-between gap-4 py-3 border-b border-line/50">
            <dt className="text-xs font-bold text-ink-subtle flex items-center gap-1.5 shrink-0">
              <UserIcon size={13} /> 名前
            </dt>
            <dd className="text-sm font-bold text-ink-soft text-right truncate">{userName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-line/50">
            <dt className="text-xs font-bold text-ink-subtle flex items-center gap-1.5 shrink-0">
              <IdCard size={13} /> 所属
            </dt>
            <dd className="text-sm font-bold text-ink-soft text-right truncate">{clientName ?? '-'}</dd>
          </div>
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

      {/* セキュリティセクション */}
      <ProfileSection title="セキュリティ">
        <Link
          href="/profile/password"
          className="group -mx-3 flex items-center gap-3 rounded-control px-3 py-3 hover:bg-surface transition-colors"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
            <KeyRound size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">パスワードを変更</span>
            <span className="block text-xs text-ink-muted">ログインに使うパスワードを新しくします</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-brand transition-colors" />
        </Link>
      </ProfileSection>
    </div>
  );
}
