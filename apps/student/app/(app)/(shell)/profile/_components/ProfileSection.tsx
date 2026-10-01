import { ShellSectionTitle } from '@/components/shell/ShellPage';

interface ProfileSectionProps {
  /** カードの上に置く区切り見出し。画面内のセクションが1つだけの場合は省略する */
  title?: string;
  children: React.ReactNode;
}

/** プロフィール・アカウント設定画面のセクション（見出し＋カード） */
export function ProfileSection({ title, children }: ProfileSectionProps) {
  return (
    <section>
      {title && <ShellSectionTitle>{title}</ShellSectionTitle>}
      <div className="bg-white border border-line/70 rounded-card shadow-sm p-6 sm:p-8">{children}</div>
    </section>
  );
}
