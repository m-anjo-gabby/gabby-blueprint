'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TRAINING_SECTION_ITEMS } from '@/constants/navigation';
import { cn } from '@/lib/utils';

/**
 * トレーニングタブの中の切り替え（教材・お気に入り・トレーニング記録）。
 * 画面内の絞り込み（PillTabs）と区別するため、下線のリンクタブにする。
 * 各画面の layout.tsx と、外側の読み込み中表示（ShellRouteSkeleton）の両方に置き、骨組みの段階から本物を出す。
 */
export function TrainingSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="トレーニング" className="mb-5 border-b border-line">
      <ul className="flex gap-6 overflow-x-auto scrollbar-none">
        {TRAINING_SECTION_ITEMS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-11 items-center text-sm font-semibold transition-colors',
                  isActive
                    ? 'text-brand-strong after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
