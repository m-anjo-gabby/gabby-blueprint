'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CircleQuestionMark } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@gabby/lib/utils';

interface HelpTipProps {
  /** ボタンの読み上げ名（例: "About Sprint Progress"）。アプリの言語で渡す */
  label: string;
  /** 説明の本文。文字列の改行はそのまま折り返す */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * 見出しや表示の横に置く `?` のヘルプ。押すと短い説明を出す。
 * ホバーのツールチップではなく押して開く形にするのは、タッチ端末でも読めるようにするため。
 */
export function HelpTip({ label, children, side = 'bottom', align = 'center', className }: HelpTipProps) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={label}
        // カード全体がリンク・ボタンの場所に置いても、親の操作を起こさない
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:text-brand cursor-pointer',
          className,
        )}
      >
        <CircleQuestionMark size={14} strokeWidth={2.25} aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium normal-case tracking-normal leading-relaxed text-slate-600 shadow-lg whitespace-pre-line break-words outline-none"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
