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

interface ProfileViewProps {
  userName: string;
  clientName: string | null;
  initialIconPath: string | null;
  initialTimezone: string;
  timezones: TimezoneMaster[];
}

/**
 * 生徒向けプロフィール設定画面
 * アイコン画像・アカウント情報をセクションカードで表示する構成とし、
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
    <div className="space-y-6">
      {/* アイコン画像セクション */}
      <section className="bg-white border border-slate-100 rounded-[28px] shadow-sm p-6 sm:p-8">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-6 select-none">
          <div className="w-1.5 h-4 bg-linear-to-b from-indigo-600 to-cyan-400 rounded-full" />
          アイコン画像
        </h2>

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
      </section>

      {/* アカウント情報セクション */}
      <section className="bg-white border border-slate-100 rounded-[28px] shadow-sm p-6 sm:p-8">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-6 select-none">
          <div className="w-1.5 h-4 bg-linear-to-b from-indigo-600 to-cyan-400 rounded-full" />
          アカウント情報
        </h2>

        <dl className="space-y-1">
          <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-50">
            <dt className="text-xs font-bold text-slate-400 flex items-center gap-1.5 shrink-0">
              <UserIcon size={13} /> 名前
            </dt>
            <dd className="text-sm font-bold text-slate-700 text-right truncate">{userName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-50">
            <dt className="text-xs font-bold text-slate-400 flex items-center gap-1.5 shrink-0">
              <IdCard size={13} /> 所属
            </dt>
            <dd className="text-sm font-bold text-slate-700 text-right truncate">{clientName ?? '-'}</dd>
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
      </section>
    </div>
  );
}
