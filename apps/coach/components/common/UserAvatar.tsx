import { User as UserIcon } from 'lucide-react';
import { ExternalImage } from '@gabby/lib/components/common/ExternalImage';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';

interface UserAvatarProps {
  userName: string;
  iconPath: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ userName, iconPath, size = 40, className = '' }: UserAvatarProps) {
  const iconUrl = getProfileIconUrl(iconPath);

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-400 overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <ExternalImage src={iconUrl} alt={userName} className="w-full h-full object-cover" />
      ) : (
        <UserIcon size={Math.round(size * 0.45)} />
      )}
    </div>
  );
}
