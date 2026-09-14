import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface ProfileFieldGroupProps {
  icon: LucideIcon;
  label: string;
  /** 直前のグループとの間に区切り線を入れるか（カード内の最初のグループはfalse） */
  withDivider?: boolean;
  children: ReactNode;
}

/**
 * Public Coach Profileカード内で項目をまとめる見出し付きセクション。
 * 新しい項目グループを追加する際はこれで包むだけで見た目が揃う。
 */
export function ProfileFieldGroup({ icon: Icon, label, withDivider = true, children }: ProfileFieldGroupProps) {
  return (
    <>
      {withDivider && <div className="h-px bg-slate-100 my-6" />}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <Icon size={13} />
          {label}
        </div>
        {children}
      </div>
    </>
  );
}
