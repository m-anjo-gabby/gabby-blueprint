import { GraduationCap } from 'lucide-react';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { cn } from '@/lib/utils';

interface CoachAvatarProps {
  iconPath: string | null;
  /** 直径(px) */
  size: number;
  className?: string;
}

/** コーチのプロフィールアイコン（丸形）。未設定時は既定アイコンを表示する */
export function CoachAvatar({ iconPath, size, className }: CoachAvatarProps) {
  const iconUrl = getProfileIconUrl(iconPath);

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-brand-500',
        className
      )}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <GraduationCap size={Math.round(size * 0.5)} />
      )}
    </div>
  );
}
