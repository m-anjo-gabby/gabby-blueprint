import Link from 'next/link';
import { cn } from '@/lib/utils';
import { isNavItemActive, type ShellNavItem } from '@/constants/navigation';
import { NavBadge } from './NavBadge';
import type { ShellNavBadges } from './useShellNavBadges';

interface BottomTabBarProps {
  items: ShellNavItem[];
  badges: ShellNavBadges;
  pathname: string;
}

/** モバイル用ボトムタブ（md未満で表示） */
export function BottomTabBar({ items, badges, pathname }: BottomTabBarProps) {
  return (
    <nav
      aria-label="メインナビゲーション"
      className="md:hidden shrink-0 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex">
        {items.map((item) => {
          const isActive = isNavItemActive(item, pathname);
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 transition-colors active:scale-95',
                  isActive ? 'text-indigo-700' : 'text-slate-500'
                )}
              >
                <span
                  className={cn(
                    'relative flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-indigo-50'
                  )}
                >
                  <item.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  <NavBadge badge={badges[item.id]} className={badges[item.id]?.count ? 'right-0' : 'right-2.5'} />
                </span>
                <span className={cn('text-[11px] leading-none', isActive ? 'font-bold' : 'font-medium')}>
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
