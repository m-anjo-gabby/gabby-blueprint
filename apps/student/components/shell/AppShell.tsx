'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/common/Header';
import { getVisibleNavItems, type ShellNavContext } from '@/constants/navigation';
import { SideNav } from './SideNav';
import { BottomTabBar } from './BottomTabBar';
import { useShellNavBadges } from './useShellNavBadges';

interface AppShellProps {
  navContext: ShellNavContext;
  children: React.ReactNode;
}

/**
 * 常設ナビゲーション付きのアプリ枠。
 * PC(md以上)は左サイドバー、モバイルはボトムタブを表示し、どちらも同じ項目定義を使う。
 * スクロールは <main> 内で完結させ、タブバー・ヘッダーは常に画面内に固定する。
 */
export function AppShell({ navContext, children }: AppShellProps) {
  const pathname = usePathname();
  const items = getVisibleNavItems(navContext);
  const badges = useShellNavBadges(navContext, pathname);

  return (
    <div className="flex h-dvh bg-linear-to-b from-[#f8faff] to-[#f2f4f7] font-sans text-slate-900 selection:bg-indigo-100">
      <SideNav items={items} badges={badges} pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main data-scroll-container className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
        <BottomTabBar items={items} badges={badges} pathname={pathname} />
      </div>
    </div>
  );
}
