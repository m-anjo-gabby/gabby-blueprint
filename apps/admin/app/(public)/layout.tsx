import type { ReactNode } from 'react';
import LocaleSwitcher from '@/components/common/LocaleSwitcher';

/** 公開画面（ログイン・パスワード忘れ・再設定・招待）の共通レイアウト。どの画面からでも表示言語を切り替えられる */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="fixed top-4 right-4 z-10">
        <LocaleSwitcher />
      </div>
      {children}
    </>
  );
}
