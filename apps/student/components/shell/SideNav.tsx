import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { isNavItemActive, type ShellNavItem } from '@/constants/navigation';
import { NavBadge } from './NavBadge';
import type { ShellNavBadges } from './useShellNavBadges';

interface SideNavProps {
  items: ShellNavItem[];
  badges: ShellNavBadges;
  pathname: string;
}

/**
 * PC用サイドナビ（md以上で表示）。
 * md〜lg はアイコン＋小ラベルのレール、lg以上はラベル横並びのサイドバーとして表示する。
 */
export function SideNav({ items, badges, pathname }: SideNavProps) {
  return (
    <aside className="hidden md:flex w-24 lg:w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <Link
        href="/dashboard"
        className="flex h-16 shrink-0 items-center justify-center lg:justify-start lg:px-6 hover:opacity-80 transition-opacity select-none"
      >
        <Image src="/logo-01.png" alt="Gabby Logo" width={120} height={32} className="h-7 lg:h-8 w-auto object-contain" priority />
      </Link>

      <nav aria-label="メインナビゲーション" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = isNavItemActive(item, pathname);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex flex-col lg:flex-row items-center gap-1 lg:gap-3 rounded-2xl px-2 py-3 lg:px-4 transition-colors',
                    isActive
                      ? 'bg-indigo-950 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <span className="relative flex shrink-0">
                    <item.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                    <NavBadge badge={badges[item.id]} className={isActive ? 'ring-indigo-950' : undefined} />
                  </span>
                  <span className={cn('text-[11px] lg:text-sm leading-tight text-center', isActive ? 'font-bold' : 'font-medium')}>
                    {/* レール幅では短縮名、サイドバー幅では正式名称 */}
                    <span className="lg:hidden">{item.shortLabel ?? item.label}</span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
