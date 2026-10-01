import Link from 'next/link';
import { ChevronRight, KeyRound, type LucideIcon } from 'lucide-react';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { ProfileSection } from './ProfileSection';

/*
 * プロフィール・パスワード変更画面の、データに依存しない部品。
 * 画面と読み込み中の骨組み（ProfileSkeleton）で共有し、骨組み→本番で形がずれないようにする。
 */

export function ProfilePageHeader() {
  return <ShellPageHeader title="プロフィール設定" description="アイコン画像やアカウント情報を確認・変更できます。" />;
}

export function PasswordPageHeader() {
  return (
    <ShellPageHeader
      title="パスワード変更"
      back={{ history: '/profile' }}
      description="現在のパスワードを入力し、新しいパスワードを設定してください。"
    />
  );
}

/** アカウント情報の1行（ラベルと値）。値は読み込み中なら骨組みを渡す */
export function AccountInfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line/50">
      <dt className="text-xs font-bold text-ink-subtle flex items-center gap-1.5 shrink-0">
        <Icon size={13} /> {label}
      </dt>
      <dd className="min-w-0 text-sm font-bold text-ink-soft text-right truncate">{children}</dd>
    </div>
  );
}

/** セキュリティ（パスワード変更への導線）。データに依存しないため骨組みでも本物を出す */
export function SecuritySection() {
  return (
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
  );
}
