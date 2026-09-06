'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Timer, Pause, Play, StickyNote, Loader2, Megaphone, ArrowRight, Info, CheckCircle2, ClipboardCheck, ChartSpline } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useExitConfirmFlow } from '@gabby/lib/hooks/useExitConfirmFlow';
import { tokenizeWords, getSprintTitle, resolveSprintHasLevel, SPRINT_NOTES_EN, SPRINT_NOTE_FOOTER_EN, SPRINT_THEMES_EN } from '@gabby/lib';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import { useLessonSprintCountdown, useAutoRedirectCountdown } from '../_hooks/useLessonSprintTimers';
import { createLessonSprintResult } from '@/actions/lessonSprintAction';
import { ScoreButtons } from './ScoreButtons';
import { WordHighlightAnswer } from './WordHighlightAnswer';
import { SprintThemeDialog } from './SprintThemeDialog';
import type { LessonSprintHistoryItem } from '@gabby/types/lessonSprint';
import { DEFAULT_LESSON_SPRINT_SCORE } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  sessionId: string | null;
  onExit: () => void;
  onComplete: (lessonSprintId: string) => void;
}

export function LessonSprintPlayer({ studentId, sessionId, onExit, onComplete }: Props) {
  const { showToast } = useToast();
  const { session, config, contentName, contentMetadata, commitScoreResult, toggleWordHighlight, setSessionNote, resetStore } = useLessonSprintStore();
  const { currentIndex, questions, currentHighlightedWords, sessionNote } = session;

  const [isSaving, setIsSaving] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [completionStats, setCompletionStats] = useState<{ answered: number; avgScore: number | null } | null>(null);
  const isPersistedRef = useRef(false);

  const currentQuestion = questions[currentIndex];
  const isSpeedMode = config.questionType === '0';
  const isQuestionBased = config.questionType === '0' || config.questionType === '6';
  const hasLevel = resolveSprintHasLevel(contentMetadata);
  const isCorpus = contentMetadata?.sprint_type === '1';
  const instructionNote = SPRINT_NOTES_EN[config.questionType || '0'];
  const themeEntry = SPRINT_THEMES_EN[`${config.questionType || '0'}_${config.level}`];

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

    const evaluated = history.filter((h) => !h.is_skipped && h.score !== null);

    // 🆕 完了ダイアログの結果先出しプレビュー。保存API完了を待たず、確定済みの内訳をこの時点で表示に反映する
    const avgScore = evaluated.length > 0
      ? Math.round((evaluated.reduce((sum, h) => sum + (h.score ?? 0), 0) / evaluated.length) * 10) / 10
      : null;
    setCompletionStats({ answered: history.length, avgScore });

    const result = await createLessonSprintResult({
      student_id: studentId,
      session_id: sessionId,
      sprint_type: latestConfig.sprintType,
      content_id: latestConfig.contentId,
      question_type: latestConfig.questionType,
      answer_type: latestConfig.answerType,
      difficulty_level: Number(latestConfig.level),
      time_limit_sec: latestConfig.timeLimitSec,
      total_answered: history.length,
      total_evaluated: evaluated.length,
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

    setResultId(result.lessonSprintId);
  }, [studentId, sessionId, showToast, onExit, buildHistory]);

  const handleGoToResult = useCallback(() => {
    if (!resultId) return;
    resetStore();
    onComplete(resultId);
  }, [resultId, resetStore, onComplete]);

  // 完了ダイアログ表示中、数秒後に自動で結果画面へ遷移する
  useAutoRedirectCountdown(!!resultId, handleGoToResult);

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

  const { secondsLeft, isPaused, togglePause, pausedSecondsRef } = useLessonSprintCountdown(config.timeLimitSec, handleTimeUp, hasStarted);

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
    <>
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

            {hasStarted ? (
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
            ) : !isCorpus ? (
              <button
                onClick={() => setIsThemeDialogOpen(true)}
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 border border-transparent text-slate-700 hover:bg-slate-200/80 active:scale-95 cursor-pointer transition-all shrink-0"
                title="View level details"
              >
                <Info size={16} strokeWidth={2.5} />
              </button>
            ) : (
              <div className="h-10 w-10 shrink-0" />
            )}
          </div>

          <div className="mt-4 w-full flex items-center gap-2 select-none">
            <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/30">
              <div
                className={cn(
                  'absolute top-0 left-0 h-full rounded-full',
                  isPaused ? 'bg-slate-300' :
                  isCritical ? 'bg-gradient-to-r from-rose-500 to-rose-600' :
                  isWarning ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                  'bg-gradient-to-r from-indigo-500 to-indigo-600'
                )}
                style={{ width: `${progressPercent}%`, transition: 'width 1s linear' }}
              />
            </div>
            <div
              className={cn(
                'shrink-0 flex items-center gap-1 font-mono text-xs font-black tracking-tight tabular-nums text-slate-700 bg-white border rounded-full px-2 py-0.5 shadow-sm',
                isCritical ? 'border-rose-200' : isWarning ? 'border-amber-200' : 'border-slate-200'
              )}
            >
              <Timer
                size={11}
                className={cn(
                  isCritical && !isPaused && 'animate-pulse',
                  isCritical ? 'text-rose-500' : isWarning ? 'text-amber-500' : 'text-indigo-500'
                )}
                strokeWidth={3}
              />
              <span>{secondsLeft}s{isPaused && ' · Paused'}</span>
            </div>
          </div>
        </div>

        {!hasStarted ? (
          <>
            {/* メイン: 開始前インストラクション */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <Megaphone size={14} className="text-indigo-500" />
                  {instructionNote.preamble}
                </div>

                <div className="bg-rose-50/60 border border-rose-100 rounded-2xl p-4">
                  <p className="text-sm sm:text-base font-bold text-rose-700 whitespace-pre-line leading-relaxed">
                    {instructionNote.emphasized}
                  </p>
                </div>

                {!isCorpus && (
                  <p className="text-xs text-slate-400 text-center">{SPRINT_NOTE_FOOTER_EN}</p>
                )}
              </div>
            </div>

            {/* フッター: 開始 */}
            <div className="shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100/60 bg-white">
              <button
                type="button"
                onClick={() => setHasStarted(true)}
                className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
              >
                Start
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
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

      <SprintThemeDialog entry={themeEntry} open={isThemeDialogOpen} onOpenChange={setIsThemeDialogOpen} />

      {/* 統合された完了レイヤー：保存中スピナー → 完了サマリー（回答数・アベレージスコア）＋自動進行 */}
      {(isSaving || resultId) && (
        <div
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300 cursor-pointer"
          onClick={resultId ? handleGoToResult : undefined}
        >
          <div className="w-full max-w-xs bg-white rounded-[32px] border border-white/60 shadow-2xl p-6 sm:p-7 text-center space-y-5 transform transition-all animate-in zoom-in-95 duration-300 ease-out">
            <div className="relative w-16 h-16 mx-auto">
              <AnimatePresence mode="popLayout" initial={false}>
                {isSaving ? (
                  <motion.div
                    key="saving-icon"
                    layoutId="lesson-sprint-completion-icon"
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm text-indigo-600"
                  >
                    <Loader2 className="w-7 h-7 animate-spin" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="done-icon"
                    layoutId="lesson-sprint-completion-icon"
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm text-indigo-600"
                  >
                    <CheckCircle2 className="w-7 h-7" strokeWidth={2.2} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                {isSaving ? 'Saving results' : 'Lesson Sprint Complete'}
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-[220px] mx-auto">
                {isSaving ? 'Please wait a moment...' : "Here's how this session went"}
              </p>
            </div>

            {completionStats && (
              <div className="flex items-center justify-center gap-x-5 py-1 select-none">
                <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                  <ClipboardCheck size={13} strokeWidth={2.5} className="text-indigo-500 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">Answered</span>
                  <span className="text-sm font-black text-slate-800 font-mono leading-none">{completionStats.answered}</span>
                </div>
                <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                  <ChartSpline size={13} strokeWidth={2.5} className="text-amber-500 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">Avg Score</span>
                  <span className="text-sm font-black text-slate-800 font-mono leading-none">
                    {completionStats.avgScore === null ? (
                      <span className="text-slate-400 font-normal">-</span>
                    ) : (
                      <>{completionStats.avgScore}<span className="text-[10px] font-medium text-slate-400 ml-0.5 font-sans">/5</span></>
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className={cn(
              'space-y-2.5 transition-all duration-500 transform',
              resultId ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            )}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleGoToResult();
                }}
                className="w-full h-12 rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 group cursor-pointer bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-md shadow-indigo-600/10 text-white border-none"
              >
                <span>View Results</span>
                <ArrowRight size={14} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform duration-200" />
              </button>

              {/* 自動遷移の演出：薄い自動進行バーで示す */}
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                {resultId && (
                  <motion.div
                    key={resultId}
                    className="h-full bg-indigo-300 rounded-full"
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 3.5, ease: 'linear' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
