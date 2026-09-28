import { ShieldCheck, User as UserIcon, Users as UsersIcon } from 'lucide-react';
import { getProfileIconUrl } from '../../profile/getProfileIconUrl';

type ChatAvatarKind = 'user' | 'group' | 'review';

interface ChatAvatarProps {
  kind?: ChatAvatarKind;
  iconPath?: string | null;
  name?: string | null;
  size?: number;
}

const KIND_ICON = { user: UserIcon, group: UsersIcon, review: ShieldCheck } as const;
const KIND_CLASS: Record<ChatAvatarKind, string> = {
  user: 'bg-brand-soft text-brand-500',
  group: 'bg-brand-soft text-brand',
  // Adminの査閲（非参加ルーム）は状態表示として amber
  review: 'bg-amber-50 text-amber-500',
};

/** 参加者・ルームのアイコン（プロフィール画像が無ければ種別のアイコンを出す） */
export function ChatAvatar({ kind = 'user', iconPath, name, size = 32 }: ChatAvatarProps) {
  const url = kind === 'user' ? getProfileIconUrl(iconPath) : null;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? ''}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  const Icon = KIND_ICON[kind];
  return (
    <div
      aria-hidden
      style={{ width: size, height: size }}
      className={`rounded-full flex items-center justify-center shrink-0 ${KIND_CLASS[kind]}`}
    >
      <Icon size={Math.round(size * 0.5)} />
    </div>
  );
}
