'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { FavoriteSprintQuestionItem } from '@gabby/types/sprint';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { cancelSpeech } from '@gabby/lib/speech/synthesis';
import { SprintPhraseBlock, type SprintPhraseVariant } from '@/components/training/sprint-result/SprintPhraseBlock';
import { cn } from '@/lib/utils';

// 出典の表示にはスプリントの分類色（アイコンのみ）を使う
const SPRINT_CONTENT_TYPE = 2;

interface SentenceDef {
  key: string;
  variant: SprintPhraseVariant;
  label: string;
  en: string;
  ja: string | null;
  voice: string | null;
}

/** 表示する文（基本文・質問文・解答文）。YES/NO の2通りの解答を持つ問題は両方を出す */
function getSentences(q: FavoriteSprintQuestionItem): SentenceDef[] {
  // Speed（0）・Mastery（6）は問いに答える形式、それ以外は指示に従う形式
  const isQuestionBased = q.question_type === '0' || q.question_type === '6';
  const hasNoAnswer = !!q.answer_sentence_no_en;
  const sentences: SentenceDef[] = [];
  if (q.statement_en) {
    sentences.push({ key: 'st', variant: 'statement', label: '基本文', en: q.statement_en, ja: q.statement_ja, voice: q.statement_voice });
  }
  sentences.push({ key: 'q', variant: 'question', label: isQuestionBased ? '質問文' : '指示文', en: q.question_en, ja: q.question_ja, voice: q.question_voice });
  sentences.push({ key: 'yes', variant: 'yes', label: hasNoAnswer ? '解答文（Yes）' : '解答文', en: q.answer_sentence_yes_en, ja: q.answer_sentence_yes_ja, voice: q.answer_sentence_yes_voice });
  if (q.answer_sentence_no_en) {
    sentences.push({ key: 'no', variant: 'no', label: '解答文（No）', en: q.answer_sentence_no_en, ja: q.answer_sentence_no_ja, voice: q.answer_sentence_no_voice });
  }
  return sentences;
}

interface SprintQuestionFavoriteCardProps {
  question: FavoriteSprintQuestionItem;
  onRemove: () => void;
}

/** お気に入りスプリント問題のカード（出典、基本文・質問文・解答文ごとの再生と日本語切り替え） */
export function SprintQuestionFavoriteCard({ question, onRemove }: SprintQuestionFavoriteCardProps) {
  const { play, isPlaying } = usePlayAudioSpeech();
  const { speak } = useWebSpeech();
  const [jaVisible, setJaVisible] = useState<Record<string, boolean>>({});
  const { icon: SourceIcon, theme } = getContentTypeConfig(SPRINT_CONTENT_TYPE);

  const handlePlay = (s: SentenceDef, audioId: string) => {
    cancelSpeech();
    // 生成済みの音声ファイルがあればそれを、無ければブラウザの音声合成で読み上げる
    if (s.voice) play(s.voice, audioId, { restart: true });
    else speak(s.en);
  };

  return (
    <article className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-xs transition-colors hover:border-brand-200 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-ink-muted">
          <SourceIcon size={14} className={cn('shrink-0', theme.iconText)} />
          <span className="truncate">{question.content_name}</span>
          <span aria-hidden className="text-ink-subtle">·</span>
          <span className="shrink-0 font-semibold text-ink-soft">{question.sprint_title}</span>
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

      {getSentences(question).map((s) => {
        const audioId = `${question.question_id}-${s.key}`;
        return (
          <SprintPhraseBlock
            key={s.key}
            variant={s.variant}
            label={s.label}
            en={s.en}
            ja={s.ja}
            onPlay={() => handlePlay(s, audioId)}
            isPlaying={isPlaying === audioId}
            isJaVisible={!!jaVisible[s.key]}
            onToggleJa={() => setJaVisible((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
          />
        );
      })}
    </article>
  );
}
