'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TRAINING_SECTION_ITEMS } from '@/constants/navigation';
import { cn } from '@/lib/utils';
import { PAGE_TITLE_CLASS } from './ShellPage';

/**
 * トレーニングタブの中の切り替え（教材・お気に入り・トレーニング記録）。
 * 画面内の絞り込み（PillTabs）と区別するため、下線のリンクタブにする。
 * 画面名はタブの上の「トレーニング」（ナビの項目名と同じ）で示し、各画面の見出しは選択中のタブと重なるため
 * 見た目には出さない（各画面は ShellPageHeader の titleHidden で読み上げ用の見出しだけを置く）。
 * 各画面の layout.tsx と、外側の読み込み中表示（ShellRouteSkeleton）の両方に置き、骨組みの段階から本物を出す。
 */
export function TrainingSectionNav() {
  const pathname = usePathname();

  return (
    <div className="mb-2">
      {/* 読み上げでは各画面の h1（教材等）を見出しにするため、ここは見出し要素にしない */}
      <p className={cn(PAGE_TITLE_CLASS, 'block pb-2 sm:pb-3')}>トレーニング</p>
      <nav aria-label="トレーニング" className="border-b border-line">
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
    </div>
  );
}
