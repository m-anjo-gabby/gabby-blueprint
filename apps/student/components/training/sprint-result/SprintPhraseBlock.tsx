'use client';

import { cn } from '@/lib/utils';
import { LookupText } from '@/components/common/LookupText';
import { PhraseAudioHeader, type PhraseAudioTone } from '@/components/common/PhraseAudioHeader';

const PHRASE_STYLES = {
  statement: { tone: 'slate', box: 'border-line', text: 'text-sm font-bold text-ink-soft leading-relaxed' },
  question: { tone: 'indigo', box: 'border-brand-500', text: 'text-lg sm:text-xl font-bold text-ink leading-snug tracking-tight' },
  yes: { tone: 'emerald', box: 'border-emerald-500 bg-emerald-50/20 py-2.5 pr-3 rounded-r-xl', text: 'text-xl sm:text-2xl font-bold text-emerald-700 tracking-tight' },
  no: { tone: 'amber', box: 'border-amber-500 bg-amber-50/20 py-2.5 pr-3 rounded-r-xl', text: 'text-xl sm:text-2xl font-bold text-amber-700 tracking-tight' },
} satisfies Record<string, { tone: PhraseAudioTone; box: string; text: string }>;

export type SprintPhraseVariant = keyof typeof PHRASE_STYLES;

interface SprintPhraseBlockProps {
  variant: SprintPhraseVariant;
  label: string;
  en: string;
  ja: string | null;
  onPlay: () => void;
  /** この文を再生中（読み込み表示） */
  isPlaying: boolean;
  playDisabled?: boolean;
  isJaVisible: boolean;
  onToggleJa: () => void;
}

/**
 * スプリント問題の1文（基本文・質問文・解答文）の表示ブロック（見出し・再生・日本語切替・本文）。
 * 結果画面とお気に入り画面で共通に使う。
 */
export function SprintPhraseBlock({ variant, label, en, ja, onPlay, isPlaying, playDisabled, isJaVisible, onToggleJa }: SprintPhraseBlockProps) {
  const style = PHRASE_STYLES[variant];
  return (
    <div className={cn('flex w-full flex-col gap-1 border-l-4 py-0.5 pl-3 text-left', style.box)}>
      <PhraseAudioHeader
        label={label}
        tone={style.tone}
        onPlay={onPlay}
        playDisabled={playDisabled}
        isLoading={isPlaying}
        jaText={ja}
        isJaVisible={isJaVisible}
        onToggleJa={onToggleJa}
      />
      {isJaVisible ? <p className={style.text}>{ja}</p> : <LookupText text={en} className={style.text} />}
    </div>
  );
}
