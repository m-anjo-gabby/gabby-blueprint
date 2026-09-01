'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Timer, Pause, Play, StickyNote, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useExitConfirmFlow } from '@gabby/lib/hooks/useExitConfirmFlow';
import { tokenizeWords, getSprintTitle, resolveSprintHasLevel } from '@gabby/lib';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import { useLessonSprintCountdown } from '../_hooks/useLessonSprintTimers';
import { createLessonSprintResult } from '@/actions/lessonSprintAction';
import { ScoreButtons } from './ScoreButtons';
import { WordHighlightAnswer } from './WordHighlightAnswer';
import type { LessonSprintHistoryItem } from '@gabby/types/lessonSprint';
import { DEFAULT_LESSON_SPRINT_SCORE } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  onExit: () => void;
  onComplete: (lessonSprintId: string) => void;
}

export function LessonSprintPlayer({ studentId, onExit, onComplete }: Props) {
  const { showToast } = useToast();
  const { session, config, contentName, contentMetadata, commitScoreResult, toggleWordHighlight, setSessionNote } = useLessonSprintStore();
  const { currentIndex, questions, currentHighlightedWords, sessionNote } = session;

  const [isSaving, setIsSaving] = useState(false);
  const isPersistedRef = useRef(false);

  const currentQuestion = questions[currentIndex];
  const isSpeedMode = config.questionType === '0';
  const isQuestionBased = config.questionType === '0' || config.questionType === '6';
  const hasLevel = resolveSprintHasLevel(contentMetadata);

  const courseTitle = useMemo(
    () => getSprintTitle(config.questionType || '0', Number(config.level), hasLevel),
    [config.questionType, config.level, hasLevel]
  );

  const answerText = useMemo(() => {
    if (!currentQuestion) return '';
    if (isSpeedMode && config.answerType === '1') {
      return currentQuestion.answer_sentence_no_en ?? '';
    }
    return currentQuestion.answer_sentence_yes_en;
  }, [currentQuestion, isSpeedMode, config.answerType]);

  const answerWords = useMemo(() => tokenizeWords(answerText), [answerText]);

  const buildHistory = useCallback((): LessonSprintHistoryItem[] => {
    const state = useLessonSprintStore.getState().session;
    return state.sessionResults.map((r, idx) => {
      const q = state.questions.find((q) => q.question_id === r.questionId);
      return {
        question_id: r.questionId,
        group_id: q?.group_id ?? null,
        seq_no: idx + 1,
        is_skipped: r.isSkipped,
        score: r.score,
        highlighted_word_indices: r.highlightedWordIndices,
      };
    });
  }, []);

  const handleSave = useCallback(async (pausedDurationSec: number) => {
    if (isPersistedRef.current) return;
    isPersistedRef.current = true;
    setIsSaving(true);

    const { config: latestConfig } = useLessonSprintStore.getState();
    const history = buildHistory();

    const isMissing = (v: string | null | undefined) => v === null || v === undefined || v === '';
    if (isMissing(latestConfig.contentId) || isMissing(latestConfig.questionType) || isMissing(latestConfig.answerType) || isMissing(latestConfig.sprintType)) {
      showToast('Missing sprint configuration. Could not save.', 'error');
      setIsSaving(false);
      onExit();
      return;
    }

    const result = await createLessonSprintResult({
      student_id: studentId,
      sprint_type: latestConfig.sprintType,
      content_id: latestConfig.contentId,
      question_type: latestConfig.questionType,
      answer_type: latestConfig.answerType,
      difficulty_level: Number(latestConfig.level),
      time_limit_sec: latestConfig.timeLimitSec,
      total_answered: history.length,
      total_evaluated: history.filter((h) => !h.is_skipped && h.score !== null).length,
      paused_duration_sec: pausedDurationSec,
      session_note: useLessonSprintStore.getState().session.sessionNote.trim() || null,
      history,
    });

    setIsSaving(false);
    if (!result.success) {
      showToast(result.message, 'error');
      onExit();
      return;
    }
    onComplete(result.lessonSprintId);
  }, [studentId, showToast, onExit, onComplete, buildHistory]);

  const handleTimeUp = useCallback(() => {
    const state = useLessonSprintStore.getState().session;
    if (!state.isActive) return;
    const current = state.questions[state.currentIndex];
    const alreadyCommitted = current && state.sessionResults.some((r) => r.questionId === current.question_id);
    if (current && !alreadyCommitted) {
      commitScoreResult(current.question_id, DEFAULT_LESSON_SPRINT_SCORE);
    }
    void handleSave(pausedSecondsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitScoreResult]);

  const { secondsLeft, isPaused, togglePause, pausedSecondsRef } = useLessonSprintCountdown(config.timeLimitSec, handleTimeUp);

  const requestExit = useExitConfirmFlow({
    confirmTitle: 'Quit Lesson Sprint?',
    confirmMessage: 'Progress will not be saved if you quit now. Continue?',
    confirmVariant: 'warning',
    onExit: () => onExit(),
  });

  const handleScore = (score: number) => {
    if (!currentQuestion || isSaving) return;
    const { isLast } = commitScoreResult(currentQuestion.question_id, score);
    if (isLast) {
      void handleSave(pausedSecondsRef.current);
    }
  };

  const timeRatio = secondsLeft / (config.timeLimitSec || 60);
  const isWarning = timeRatio <= 0.5 && timeRatio > 0.2;
  const isCritical = timeRatio <= 0.2;
  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / (config.timeLimitSec || 60)) * 100));

  return (
    <div className="fixed inset-0 z-40 w-full h-full bg-slate-50 flex items-center justify-center gap-4 p-2 overflow-hidden text-slate-900">
      <main className="bg-white border border-slate-100 w-full max-w-3xl h-full max-h-[95vh] rounded-[32px] flex flex-col relative overflow-hidden shadow-2xl">
        {/* ヘッダー: 戻る・タイトル・タイマー */}
        <div className="shrink-0 w-full px-6 pt-5 pb-3 border-b border-slate-100/60 bg-white relative z-10">
          <div className="flex items-center justify-between h-10">
            <button
              onClick={requestExit}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-95 cursor-pointer transition-all shrink-0"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>

            <div className="flex-1 flex flex-col items-center px-4 min-w-0">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5 select-none shrink-0">
                {contentName || 'Lesson Sprint'}
              </span>
              <h1 className="text-sm font-black text-slate-800 tracking-tight text-center w-full truncate">
                {courseTitle}
              </h1>
            </div>

            <button
              onClick={togglePause}
              className={cn(
                'h-10 w-10 flex items-center justify-center rounded-xl border active:scale-95 cursor-pointer transition-all shrink-0',
                isPaused ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-slate-100 border-transparent text-slate-700 hover:bg-slate-200/80'
              )}
              title={isPaused ? 'Resume timer' : 'Pause timer'}
            >
              {isPaused ? <Play size={16} strokeWidth={2.5} /> : <Pause size={16} strokeWidth={2.5} />}
            </button>
          </div>

          <div className="mt-4 w-full select-none">
            <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/30">
              <div
                className={cn(
                  'absolute top-0 left-0 h-full rounded-full flex items-center justify-end pr-3',
                  isPaused ? 'bg-slate-300' :
                  isCritical ? 'bg-gradient-to-r from-rose-500 to-rose-600' :
                  isWarning ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                  'bg-gradient-to-r from-indigo-500 to-indigo-600'
                )}
                style={{ width: `${progressPercent}%`, transition: 'width 1s linear' }}
              />
              <div className="absolute inset-y-0 right-3 flex items-center select-none pointer-events-none z-20">
                <div className="flex items-center gap-1 font-mono text-xs font-black tracking-tight tabular-nums text-slate-600">
                  <Timer size={11} className={cn(isCritical && !isPaused && 'animate-pulse')} strokeWidth={3} />
                  <span>{secondsLeft}s{isPaused && ' · Paused'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* メイン: 問題表示エリア */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto overscroll-contain">
          <div className="w-full max-w-2xl mx-auto flex flex-col gap-5">
            <div className="text-xs font-bold text-slate-400 text-center">
              Question {currentIndex + 1}
            </div>

            {currentQuestion?.statement_en && !isSpeedMode && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1">Statement</p>
                <p className="text-base font-bold text-slate-800">{currentQuestion.statement_en}</p>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                {isQuestionBased ? 'Question' : 'Instruction'}
              </p>
              <p className="text-xl sm:text-2xl font-black text-slate-800">{currentQuestion?.question_en}</p>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-2 text-center">
                Answer{isSpeedMode ? (config.answerType === '1' ? ' (NO)' : ' (YES)') : ''} — tap words to mark
              </p>
              {currentQuestion && (
                <WordHighlightAnswer
                  words={answerWords}
                  highlighted={currentHighlightedWords}
                  onToggle={(idx) => toggleWordHighlight(idx)}
                />
              )}
            </div>
          </div>
        </div>

        {/* フッター: 評価 */}
        <div className="shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100/60 bg-white">
          <ScoreButtons onScore={handleScore} disabled={isSaving} />
        </div>
      </main>

      {/* メモ: メインパネルとバランスを崩さないよう、独立したカードとして右側に配置。
          制限時間のあるトレーニング中も記録し続けられるよう常時表示。 */}
      <aside className="hidden lg:flex flex-col w-72 h-full max-h-[95vh] bg-white border border-slate-100 rounded-[32px] shadow-2xl overflow-hidden p-4 gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider shrink-0">
          <StickyNote size={13} strokeWidth={2.5} />
          Notes
        </div>
        <Textarea
          value={sessionNote}
          onChange={(e) => setSessionNote(e.target.value)}
          placeholder="Jot down notes during the session (pronunciation, dropped words, etc.)"
          className="flex-1 min-h-0 resize-none text-sm bg-slate-50/50"
        />
      </aside>

      {isSaving && (
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-xs bg-white rounded-[32px] border border-white/60 shadow-2xl p-7 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 text-indigo-600">
              <Loader2 className="w-7 h-7 animate-spin" strokeWidth={2.5} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Saving results</h3>
              <p className="text-xs text-slate-400 font-medium">Please wait a moment...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
