'use client';

import React from 'react';
import { Languages, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PhraseAudioTone = 'slate' | 'indigo' | 'emerald' | 'amber';

const TONE_STYLES: Record<
  PhraseAudioTone,
  { label: string; idle: string; hover: string; langActive: string; langIdle: string }
> = {
  slate: {
    label: 'text-slate-400',
    idle: 'text-slate-400',
    hover: 'hover:text-indigo-500 hover:bg-slate-100',
    langActive: 'bg-slate-100 text-indigo-600',
    langIdle: 'text-slate-300 hover:text-slate-400 hover:bg-slate-50',
  },
  indigo: {
    label: 'text-indigo-500',
    idle: 'text-indigo-400',
    hover: 'hover:text-indigo-600 hover:bg-indigo-50',
    langActive: 'bg-indigo-50 text-indigo-600',
    langIdle: 'text-indigo-200 hover:text-indigo-400 hover:bg-indigo-50',
  },
  emerald: {
    label: 'text-emerald-600',
    idle: 'text-emerald-500',
    hover: 'hover:bg-emerald-100',
    langActive: 'bg-emerald-100 text-emerald-600',
    langIdle: 'text-emerald-400/60 hover:text-emerald-600 hover:bg-emerald-100/50',
  },
  amber: {
    label: 'text-amber-600',
    idle: 'text-amber-500',
    hover: 'hover:bg-amber-100',
    langActive: 'bg-amber-100 text-amber-600',
    langIdle: 'text-amber-400/60 hover:text-amber-600 hover:bg-amber-100/50',
  },
};

interface PhraseAudioHeaderProps {
  /** 「基本文」「質問」「解答（YES）」等のラベル文言 */
  label: string;
  tone: PhraseAudioTone;
  onPlay: (e: React.MouseEvent) => void;
  /** 再生中インジケータ（Result画面のグローバル再生ID突き合わせ用）。未指定時は常にVolume2アイコン */
  isLoading?: boolean;
  playDisabled?: boolean;
  /** 日本語訳。null/undefined/空文字の場合は言語切替ボタン自体を表示しない */
  jaText?: string | null;
  isJaVisible?: boolean;
  onToggleJa?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * フレーズ見出し行（ラベル＋再生ボタン＋日本語切替ボタン）の共通コンポーネント。
 * QuestionCard / SprintResult で同一マークアップが色違いで重複していたため共通化。
 * タップ領域は視認性・誤タップ防止のため 32px（w-8 h-8）に統一。
 */
export const PhraseAudioHeader: React.FC<PhraseAudioHeaderProps> = ({
  label,
  tone,
  onPlay,
  isLoading = false,
  playDisabled = false,
  jaText,
  isJaVisible = false,
  onToggleJa,
  className,
}) => {
  const styles = TONE_STYLES[tone];

  return (
    <div className={cn('flex items-center w-full mb-1', className)}>
      <div className={cn('flex items-center gap-x-1', styles.label)}>
        <span className="text-xs font-bold tracking-wider whitespace-nowrap leading-none">
          {label}
        </span>
        <button
          type="button"
          onClick={onPlay}
          disabled={playDisabled}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:pointer-events-none shrink-0',
            isLoading ? 'text-indigo-600 bg-indigo-50' : cn(styles.idle, styles.hover),
          )}
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Volume2 size={16} strokeWidth={2.5} />
          )}
        </button>
        {jaText && onToggleJa && (
          <button
            type="button"
            onClick={onToggleJa}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-md transition-all cursor-pointer shrink-0',
              isJaVisible ? styles.langActive : styles.langIdle,
            )}
          >
            <Languages size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
