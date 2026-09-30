'use client';

import { Trash2, Volume2 } from 'lucide-react';
import type { FavoritePhraseItem } from '@gabby/types/word';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { cancelSpeech } from '@gabby/lib/speech/synthesis';

// フレーズは単語帳の教材に属するため、出典の表示には単語帳の分類色（アイコンのみ）を使う
const WORD_CONTENT_TYPE = 0;

interface PhraseFavoriteCardProps {
  phrase: FavoritePhraseItem;
  onRemove: () => void;
}

/** お気に入りフレーズのカード（出典の教材・単語、英文、日本語訳、音声再生） */
export function PhraseFavoriteCard({ phrase, onRemove }: PhraseFavoriteCardProps) {
  // 生成済みの音声ファイルがあればそれを、無ければブラウザの音声合成で読み上げる
  const { play, isPlaying } = usePlayAudioSpeech();
  const { speak, isSpeaking } = useWebSpeech();
  const { icon: SourceIcon, theme } = getContentTypeConfig(WORD_CONTENT_TYPE);

  const isAudioActive = isPlaying === phrase.phrase_id || isSpeaking;

  const handleSpeak = () => {
    cancelSpeech();
    if (phrase.audio_path && phrase.tts_status === 1) {
      play(phrase.audio_path, phrase.phrase_id, { restart: true });
    } else {
      speak(phrase.phrase_en);
    }
  };

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-xs transition-colors hover:border-brand-200 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-ink-muted">
          <SourceIcon size={14} className={cn('shrink-0', theme.iconText)} />
          <span className="truncate">{phrase.content_name}</span>
          {phrase.word_en && (
            <>
              <span aria-hidden className="text-ink-subtle">·</span>
              <span className="shrink-0 font-semibold text-ink-soft">{phrase.word_en}</span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label="お気に入りから削除"
          className="-mr-2 -mt-1 shrink-0 rounded-full p-2 text-ink-subtle transition-all hover:bg-rose-50 hover:text-rose-500 active:scale-75"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        <p lang="en" className="text-lg font-bold leading-snug text-ink sm:text-xl">
          {phrase.phrase_en}
        </p>
        <p className="text-sm leading-relaxed text-ink-muted">{phrase.phrase_ja}</p>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={handleSpeak}
        className="mt-4 h-10 rounded-control border-none bg-brand-soft px-4 text-sm font-semibold text-brand shadow-none hover:bg-brand-100"
      >
        <Volume2 size={16} className={cn('mr-1.5', isAudioActive && 'animate-pulse')} />
        音声を聞く
      </Button>
    </article>
  );
}
