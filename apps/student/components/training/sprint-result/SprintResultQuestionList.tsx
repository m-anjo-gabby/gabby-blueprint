'use client';

import { useMemo, useState } from 'react';
import { ChartSpline, Play, SkipForward } from 'lucide-react';
import { getFeedbackConfig } from '@gabby/lib';
import type { SprintQuestion } from '@gabby/types/sprint';
import type { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';
import type { SprintHistoryItem } from '@/actions/sprintAction';
import { cn } from '@/lib/utils';
import { LookupText } from '@/components/common/LookupText';
import { PhraseAudioHeader, type PhraseAudioTone } from '@/components/common/PhraseAudioHeader';
import { SprintFeedback } from '@/app/(app)/training/sprint/play/_components/SprintFeedback';
import { sprintAudioId, type SprintResultPlayback } from './useSprintResultPlayback';
import type { SprintResultScore } from './types';

/** 再生中インジケータ（3本のバー） */
export function PlayingBars({ className }: { className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center gap-0.5', className)}>
      <span className="h-full w-0.5 animate-bounce rounded-xs bg-current" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
      <span className="h-full w-0.5 animate-bounce rounded-xs bg-current" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
      <span className="h-2/3 w-0.5 animate-bounce rounded-xs bg-current" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
    </span>
  );
}

const PHRASE_STYLES = {
  statement: { tone: 'slate', box: 'border-line', text: 'text-sm font-bold text-ink-soft leading-relaxed' },
  question: { tone: 'indigo', box: 'border-brand-500', text: 'text-lg sm:text-xl font-bold text-ink leading-snug tracking-tight' },
  yes: { tone: 'emerald', box: 'border-emerald-500 bg-emerald-50/20 py-2.5 pr-3 rounded-r-xl', text: 'text-xl sm:text-2xl font-bold text-emerald-700 tracking-tight' },
  no: { tone: 'amber', box: 'border-amber-500 bg-amber-50/20 py-2.5 pr-3 rounded-r-xl', text: 'text-xl sm:text-2xl font-bold text-amber-700 tracking-tight' },
} satisfies Record<string, { tone: PhraseAudioTone; box: string; text: string }>;

interface PhraseBlockProps {
  variant: keyof typeof PHRASE_STYLES;
  label: string;
  en: string;
  ja: string | null;
  audioId: string;
  onPlay: () => void;
  playback: SprintResultPlayback;
  isJaVisible: boolean;
  onToggleJa: () => void;
}

/** 基本文・質問文・解答文の1ブロック（見出し・再生・日本語切替・本文） */
function PhraseBlock({ variant, label, en, ja, audioId, onPlay, playback, isJaVisible, onToggleJa }: PhraseBlockProps) {
  const style = PHRASE_STYLES[variant];
  return (
    <div className={cn('flex w-full flex-col gap-1 border-l-4 py-0.5 pl-3 text-left', style.box)}>
      <PhraseAudioHeader
        label={label}
        tone={style.tone}
        onPlay={onPlay}
        playDisabled={playback.playbackMode === 'all'}
        isLoading={playback.playingAudioId === audioId}
        jaText={ja}
        isJaVisible={isJaVisible}
        onToggleJa={onToggleJa}
      />
      {isJaVisible ? <p className={style.text}>{ja}</p> : <LookupText text={en} className={style.text} />}
    </div>
  );
}

interface QuestionCardProps {
  q: SprintQuestion;
  index: number;
  scoreData: SprintResultScore;
  historyItem: SprintHistoryItem | undefined;
  playback: SprintResultPlayback;
  jaVisibleMap: Record<string, boolean>;
  onToggleJa: (audioId: string) => void;
  onOpenFeedback: (target: { feedback: FeedbackConfig; analysis: AnalysisResult }) => void;
}

function QuestionCard({ q, index, scoreData, historyItem, playback, jaVisibleMap, onToggleJa, onOpenFeedback }: QuestionCardProps) {
  const isFocused = playback.focusedQuestionId === q.question_id;
  const isSkipped = historyItem?.is_skipped ?? false;
  const totalScore = historyItem?.assessment?.total_score;
  // 旧データ（analysis未保存）はタップ不可の通常バッジとして表示する
  const analysis = historyItem?.assessment?.analysis;
  const isQuestionBased = scoreData.question_type === '0' || scoreData.question_type === '6';
  const isSpeedMode = scoreData.question_type === '0' && !!q.answer_sentence_no_en;

  const phrase = (
    variant: keyof typeof PHRASE_STYLES,
    label: string,
    audioId: string,
    en: string,
    ja: string | null,
    voice: string | null
  ) => (
    <PhraseBlock
      variant={variant}
      label={label}
      en={en}
      ja={ja}
      audioId={audioId}
      onPlay={() => playback.playPhrase(q.question_id, audioId, voice)}
      playback={playback}
      isJaVisible={!!jaVisibleMap[audioId]}
      onToggleJa={() => onToggleJa(audioId)}
    />
  );

  return (
    <div
      id={`card-${q.question_id}`}
      className={cn(
        'relative flex flex-col gap-4 rounded-card border bg-surface p-4 shadow-sm transition-all duration-300 sm:p-5',
        isFocused && 'scale-[1.01] border-transparent shadow-md ring-2 ring-brand-500',
        isSkipped ? 'border-line/50 bg-canvas opacity-85' : 'border-line'
      )}
    >
      {/* 上段：問題番号・問題ごとの再生・スコア/スキップ */}
      <div className="flex w-full items-center justify-between border-b border-line/60 pb-1">
        <div className="flex items-center gap-3">
          <span className="select-none font-mono text-base font-bold leading-none tracking-tight text-ink-subtle">
            #{String(index + 1).padStart(2, '0')}
          </span>

          <button
            type="button"
            onClick={() => playback.playQuestion(q)}
            disabled={playback.playbackMode === 'all'}
            className={cn(
              'group flex h-7 select-none items-center gap-1.5 whitespace-nowrap rounded-full border pl-2.5 pr-3 transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-40',
              isFocused
                ? 'border-transparent bg-brand text-white shadow-xs'
                : 'border-line bg-canvas text-ink-muted hover:bg-brand-soft hover:text-brand'
            )}
            title="一連の流れを再生"
          >
            {isFocused ? (
              <PlayingBars className="h-2.5 w-2.5" />
            ) : (
              <Play size={11} fill="currentColor" className="shrink-0 transition-transform group-hover:scale-110" />
            )}
            <span className="text-[11px] font-bold">{isFocused ? '再生中' : '再生'}</span>
          </button>
        </div>

        {isSkipped ? (
          <span className="inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-amber-200/50 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-600">
            <SkipForward size={11} strokeWidth={2.5} />
            スキップ
          </span>
        ) : (
          typeof totalScore === 'number' && (
            <button
              type="button"
              disabled={!analysis}
              onClick={() => {
                if (!analysis) return;
                onOpenFeedback({ feedback: getFeedbackConfig(analysis.score), analysis });
              }}
              title={analysis ? 'タップして発話フィードバックを見る' : undefined}
              className={cn(
                'inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-[11px] font-bold leading-none tracking-tight transition-transform',
                totalScore >= 80
                  ? 'border-emerald-200/60 bg-emerald-50 text-emerald-700'
                  : totalScore >= 50
                    ? 'border-sky-200/60 bg-sky-50 text-sky-700'
                    : 'border-line bg-canvas text-ink-soft',
                analysis ? 'cursor-pointer hover:brightness-95 active:scale-95' : 'cursor-default'
              )}
            >
              <ChartSpline size={12} strokeWidth={2.5} className="shrink-0 opacity-80" />
              スコア
              <span className="font-mono">{totalScore}</span>
            </button>
          )
        )}
      </div>

      {q.statement_en &&
        phrase('statement', '基本文', sprintAudioId.statement(q.question_id), q.statement_en, q.statement_ja, q.statement_voice)}

      {phrase(
        'question',
        isQuestionBased ? '質問文' : '指示文',
        sprintAudioId.question(q.question_id),
        q.question_en,
        q.question_ja,
        q.question_voice
      )}

      <div className="w-full pt-1">
        {!isSpeedMode
          ? phrase('yes', '解答文', sprintAudioId.answer(q.question_id), q.answer_sentence_yes_en, q.answer_sentence_yes_ja, q.answer_sentence_yes_voice)
          : scoreData.answer_type === '1'
            ? phrase('no', '解答文', sprintAudioId.no(q.question_id), q.answer_sentence_no_en ?? '', q.answer_sentence_no_ja, q.answer_sentence_no_voice)
            : phrase('yes', '解答文', sprintAudioId.yes(q.question_id), q.answer_sentence_yes_en, q.answer_sentence_yes_ja, q.answer_sentence_yes_voice)}
      </div>
    </div>
  );
}

interface SprintResultQuestionListProps {
  scoreData: SprintResultScore;
  questions: SprintQuestion[];
  playback: SprintResultPlayback;
}

/** 実施した問題のカード一覧（スコアタップで発話フィードバックを開く） */
export function SprintResultQuestionList({ scoreData, questions, playback }: SprintResultQuestionListProps) {
  const [jaVisibleMap, setJaVisibleMap] = useState<Record<string, boolean>>({});
  const [feedbackTarget, setFeedbackTarget] = useState<{ feedback: FeedbackConfig; analysis: AnalysisResult } | null>(null);

  // question_id で履歴を突き合わせる。保存時点に存在した問題が後からマスタ側で削除/非公開化されると
  // questions 側だけ短くなり index がずれるため、index ではなく question_id をキーにする。
  const historyByQuestionId = useMemo(() => {
    const map = new Map<string, SprintHistoryItem>();
    scoreData.answered_history.forEach((h) => map.set(h.question_id, h));
    return map;
  }, [scoreData.answered_history]);

  const toggleJa = (audioId: string) => {
    setJaVisibleMap((prev) => ({ ...prev, [audioId]: !prev[audioId] }));
  };

  return (
    <>
      <div className="space-y-3">
        {questions.map((q, index) => (
          <QuestionCard
            key={q.question_id}
            q={q}
            index={index}
            scoreData={scoreData}
            historyItem={historyByQuestionId.get(q.question_id)}
            playback={playback}
            jaVisibleMap={jaVisibleMap}
            onToggleJa={toggleJa}
            onOpenFeedback={setFeedbackTarget}
          />
        ))}
      </div>

      <SprintFeedback
        feedback={feedbackTarget?.feedback ?? null}
        analysis={feedbackTarget?.analysis ?? null}
        onClose={() => setFeedbackTarget(null)}
      />
    </>
  );
}
