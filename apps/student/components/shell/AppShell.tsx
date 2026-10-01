'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/common/Header';
import { cn } from '@/lib/utils';
import { getVisibleNavItems, isMobileFocusPath } from '@/constants/navigation';
import { useShellNavContext } from './ShellNavContext';
import { ShellDataLoader } from './ShellDataLoader';
import { SideNav } from './SideNav';
import { BottomTabBar } from './BottomTabBar';
import { useShellNavBadges } from './useShellNavBadges';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * 常設ナビゲーション付きのアプリ枠。
 * PC(md以上)は左サイドバー、モバイルはボトムタブを表示し、どちらも同じ項目定義を使う。
 * スクロールは <main> 内で完結させ、タブバー・ヘッダーは常に画面内に固定する。
 * ナビ項目の表示可否は (app)/layout.tsx から ShellNavProvider で受け取る。
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const navContext = useShellNavContext();
  const items = getVisibleNavItems(navContext);
  const badges = useShellNavBadges(navContext);
  // チャットルーム等の作業画面では、モバイルのヘッダー・ボトムタブを隠して縦幅を作業領域に回す
  const isMobileFocus = isMobileFocusPath(pathname);

  return (
    <div className="flex h-dvh bg-canvas font-sans text-ink selection:bg-brand-100">
      <ShellDataLoader />
      <SideNav items={items} badges={badges} pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn('contents', isMobileFocus && 'max-md:hidden')}>
          <Header />
        </div>
        <main data-scroll-container className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
        {!isMobileFocus && <BottomTabBar items={items} badges={badges} pathname={pathname} />}
      </div>
    </div>
  );
}
