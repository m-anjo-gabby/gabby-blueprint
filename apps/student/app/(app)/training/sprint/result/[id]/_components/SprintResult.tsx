// apps\student\app\(app)\training\sprint\result\[id]\_components\SprintResult.tsx
'use client';

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy, CheckCircle2, ArrowRight, PlayCircle, SkipForward, Mic, ChartSpline, Play, Home, FastForward } from 'lucide-react';
import { cn } from "@/lib/utils";
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { setAudioSessionPlayback, getFeedbackConfig } from '@gabby/lib';
import type { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';
import type { SprintHistoryItem } from '@/actions/sprintAction';

import { LookupText } from '@/components/common/LookupText';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { PhraseAudioHeader } from '@/components/common/PhraseAudioHeader';
import { SprintFeedback } from '@/app/(app)/training/sprint/play/_components/SprintFeedback';

interface SprintResultProps {
  scoreData: {
    self_sprint_id: string;
    sprint_type: string;
    content_id: string;
    question_type: string;
    answer_type: string;
    difficulty_level: number;
    time_limit_sec: number;
    total_answered: number;
    created_at: string;
    // 🆕 Server Action から page.tsx を経由して受け取る拡張データ
    answered_history?: SprintHistoryItem[];
    totalAssessmentCount?: number;
    averageAssessmentScore?: number;
  };
  questions: any[];
  courseTitle: string;
  // 🆕 スプリント実施画面から遷移してきたかどうか（フッターの初期表示を出し分ける）
  cameFromPlay?: boolean;
}

export const SprintResult: React.FC<SprintResultProps> = ({
  scoreData,
  questions,
  courseTitle,
  cameFromPlay = false,
}) => {
  const router = useRouter();

  // 🆕 拡張された共通フックの呼び出し。コンポーネント独自の重複AudioContextロジックをリプレイス
  const { play: playAudioSpeech, stop: stopAudioSpeech, isPlaying: globalPlayingId, unlockAudioContext, resumeStatus } = usePlayAudioSpeech();

  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isBatchPlaying, setIsBatchPlaying] = useState(false);
  // 🆕 フッターの主役ボタンの表示モード。実施直後(cameFromPlay)は「全て再生」から始まり、
  // 再生完了/停止で「リトライ」に切り替わる。履歴一覧からの遷移は常にリトライ固定。
  const [footerShowsRetry, setFooterShowsRetry] = useState(!cameFromPlay);
  const [jaVisibleMap, setJaVisibleMap] = useState<Record<string, boolean>>({});
  // 🆕 スコアタップ時のドリル同様の発話フィードバック表示（旧データはanalysis無しのためタップ不可）
  const [feedbackTarget, setFeedbackTarget] = useState<{ feedback: FeedbackConfig; analysis: AnalysisResult } | null>(null);
 
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
 
  const toggleJa = (key: string) => {
    setJaVisibleMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // 🛠️ question_id で履歴を突き合わせる。answered_history 保存時点に存在した問題が
  // 後からマスタ側で削除/非公開化されていると questions 側だけ短くなり index がずれるため、
  // index ではなく question_id をキーにして対応関係を保証する。
  const historyByQuestionId = useMemo(() => {
    const map = new Map<string, SprintHistoryItem>();
    scoreData.answered_history?.forEach((h) => map.set(h.question_id, h));
    return map;
  }, [scoreData.answered_history]);

  const isBatchPlayingRef = useRef(false);
  // グローバルキャッシュを使用（画面遷移後に戻ってきてもバッファを再利用できる）
  const isMountedRef = useRef(true);
 
  const stopAllAudio = useCallback(() => {
    // 共通オーディオフックの停止ロジックを呼び出し
    stopAudioSpeech();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [stopAudioSpeech]);
 
  // 🚀 マウント時の初期化とアンマウント時のクリーンアップ
  useEffect(() => {
    isMountedRef.current = true;

    // 前の画面でマイクが使われていた場合、確実にスピーカー出力へ戻す
    setAudioSessionPlayback();

    return () => {
      isMountedRef.current = false;
      isBatchPlayingRef.current = false;
      stopAllAudio();
    };
  }, [stopAllAudio]);
 
  useEffect(() => {
    if (focusedCardId && isBatchPlaying) {
      const element = document.getElementById(`card-${focusedCardId}`);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [focusedCardId, isBatchPlaying]);
 
  const handlePlayAudio = async (
    questionId: string, 
    text: string, 
    audioPath: string | null,
    isManualClick = false
  ): Promise<void> => {
    if (!isMountedRef.current) return;
    
    if (isManualClick) {
      isBatchPlayingRef.current = false;
      setIsBatchPlaying(false);
      setFocusedCardId(questionId.split('-')[0]);
    }
    
    if (audioPath) {
      // 共通フックの play を await することで再生完了まで同期的に待機する
      await playAudioSpeech(audioPath, questionId, { restart: true });
    }
  };

  const handlePlaySingleQuestion = async (q: any) => {
    isBatchPlayingRef.current = false;
    setIsBatchPlaying(false);
    stopAllAudio();
    if (!isMountedRef.current) return;
    setFocusedCardId(q.question_id);
    const isSpeedMode = scoreData.question_type === '0';

    try {
      if (!isSpeedMode && q.statement_en) {
        await handlePlayAudio(q.question_id + '-st', q.statement_en, q.statement_voice);
        if (!isMountedRef.current) return;
        await new Promise(r => setTimeout(r, 400));
      }
      if (!isMountedRef.current) return;
      await handlePlayAudio(q.question_id + '-q', q.question_en, q.question_voice);
      if (!isMountedRef.current) return;
      await new Promise(r => setTimeout(r, 400));
      
      if (!isMountedRef.current) return;
      const ansText = scoreData.answer_type === '1' ? q.answer_sentence_no_en : q.answer_sentence_yes_en;
      const ansVoice = scoreData.answer_type === '1' ? q.answer_sentence_no_voice : q.answer_sentence_yes_voice;
      const ansId = isSpeedMode 
        ? (scoreData.answer_type === '1' ? q.question_id + '-no' : q.question_id + '-yes')
        : q.question_id + '-ans';
      await handlePlayAudio(ansId, ansText ?? "", ansVoice);
    } catch (e) {
      console.error("Single sequence play error:", e);
    } finally {
      if (isMountedRef.current) {
        setFocusedCardId(null);
      }
    }
  };

  const handlePlayAll = async () => {
    if (isBatchPlayingRef.current) {
      isBatchPlayingRef.current = false;
      setIsBatchPlaying(false);
      stopAllAudio();
      setFocusedCardId(null);
      // 🆕 手動停止後はフッターをリトライボタンに戻す
      setFooterShowsRetry(true);
      return;
    }

    isBatchPlayingRef.current = true;
    setIsBatchPlaying(true);
    const isSpeedMode = scoreData.question_type === '0';

    try {
      for (const q of questions) {
        if (!isBatchPlayingRef.current || !isMountedRef.current) break;
        setFocusedCardId(q.question_id);

        if (!isSpeedMode && q.statement_en) {
          await handlePlayAudio(q.question_id + '-st', q.statement_en, q.statement_voice);
          if (!isBatchPlayingRef.current || !isMountedRef.current) break;
          await new Promise(r => setTimeout(r, 400));
        }

        if (!isBatchPlayingRef.current || !isMountedRef.current) break;
        await handlePlayAudio(q.question_id + '-q', q.question_en, q.question_voice);
        if (!isBatchPlayingRef.current || !isMountedRef.current) break;
        await new Promise(r => setTimeout(r, 400));
        
        if (!isBatchPlayingRef.current || !isMountedRef.current) break;
        const ansText = scoreData.answer_type === '1' ? q.answer_sentence_no_en : q.answer_sentence_yes_en;
        const ansVoice = scoreData.answer_type === '1' ? q.answer_sentence_no_voice : q.answer_sentence_yes_voice;
        const ansId = isSpeedMode 
          ? (scoreData.answer_type === '1' ? q.question_id + '-no' : q.question_id + '-yes')
          : q.question_id + '-ans';
        await handlePlayAudio(ansId, ansText ?? "", ansVoice);
        if (!isBatchPlayingRef.current || !isMountedRef.current) break;
        await new Promise(r => setTimeout(r, 800));
      }
    } finally {
      if (isMountedRef.current) {
        isBatchPlayingRef.current = false;
        setIsBatchPlaying(false);
        setFocusedCardId(null);
        // 🆕 再生完了後はフッターをリトライボタンに戻す
        setFooterShowsRetry(true);
      }
    }
  };

  const isQuestionBased = scoreData.question_type === '0' || scoreData.question_type === '6';

  // 事前計算された数値。Actionから降りてこない場合のフォールバック付き
  const displayTotalAnswered = scoreData.total_answered;
  const displayTotalAssessment = scoreData.totalAssessmentCount ?? 0;
  const displayAverageScore = scoreData.averageAssessmentScore ?? 0;

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="relative w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">
        
{/* ────────────── ヘッダー：シンプル中央寄せ・余白調整モデル ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-4">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <Trophy size={115} strokeWidth={1.2} className="text-indigo-600" />
          </div>
          
          {/* 上段：ナビゲーション */}
          <div className="relative flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const date = new Date(scoreData.created_at);
                  const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                  router.push(`/training/sprint/history?month=${monthStr}&focus=${scoreData.self_sprint_id}`);
                }}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/70 hover:text-indigo-600 active:scale-95 transition-all"
                title="履歴に戻る"
              >
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100/80 shadow-xs hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
                title="ダッシュボードに戻る"
              >
                <Home size={18} strokeWidth={2.5} />
              </button>
            </div>
            
            <div className="text-right">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] font-mono block">
                Sprint Result
              </span>
              <p className="text-[9px] font-bold text-slate-400 opacity-90">
                {formatZonedDate(scoreData.created_at, timezone)}
              </p>
            </div>
          </div>

          {/* 中段：コースタイトル ＆ 属性バッジ（中央寄せにしつつ、横並び一列に統合） */}
          <div className="relative flex items-center justify-center gap-2.5 px-1 z-10">
            <h2 className="text-base sm:text-xl font-black text-slate-800 tracking-tight leading-tight truncate max-w-[65%] text-center">
              {courseTitle}
            </h2>
            
            <div className="flex items-center gap-1.5 shrink-0">
              {scoreData.question_type === '0' && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider font-mono inline-flex items-center align-middle shadow-2xs border",
                  scoreData.answer_type === '1' 
                    ? "bg-amber-50 text-amber-700 border-amber-200/60"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                )}>
                  {scoreData.answer_type === '1' ? 'NO' : 'YES'}
                </span>
              )}

              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-200/70 text-slate-600 rounded-md border border-slate-300/30">
                {scoreData.time_limit_sec}s
              </span>
            </div>
          </div>

          {/* 下段：実績スコアボード（中央寄せ） */}
          <div className="relative z-10 pt-0.5 flex justify-center select-none">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-slate-700 font-sans">
              {/* 回答数 */}
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <CheckCircle2 size={13} fill="none" strokeWidth={2.5} className="text-indigo-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">回答</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{displayTotalAnswered}</span>
              </div>
              {/* 発話数 */}
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <Mic size={13} className="text-rose-500 shrink-0 stroke-[2.5]" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">発話</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{displayTotalAssessment}</span>
              </div>
              {/* 平均スコア */}
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <ChartSpline size={13} strokeWidth={2.5} className="text-amber-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">平均スコア</span>
                <span className="text-sm font-black text-indigo-600 font-mono leading-none inline-flex items-baseline">
                  {displayTotalAssessment > 0 ? (
                    <>
                      {displayAverageScore}
                      <span className="text-[10px] font-medium text-slate-400 ml-0.5 font-sans leading-none">/100</span>
                    </>
                  ) : (
                    <span className="text-slate-400 font-normal leading-none">-</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：出題リスト ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 sm:p-6">
          <div className="max-w-2xl mx-auto space-y-3">
            {questions.map((q, index) => {
                const isSpeedModePayload = scoreData.question_type === '0' && q.answer_sentence_no_en;
                const isFocused = focusedCardId === q.question_id;

                // 🆕 question_id で突き合わせた履歴データを取り出す（index には依存しない）
                const historyItem = historyByQuestionId.get(q.question_id);
                const isSkipped = historyItem?.is_skipped ?? false;
                const totalScore = historyItem?.assessment?.total_score;
                // 🆕 旧データ（analysis未保存）はタップ不可の通常バッジとして表示する
                const analysisDetail = historyItem?.assessment?.analysis;

                // 🆕 各種音声再生を共通フックのグローバル再生IDと突き合わせるための個別ID定義
                const stAudioId = q.question_id + '-st';
                const qAudioId = q.question_id + '-q';
                const yesAudioId = q.question_id + '-yes';
                const noAudioId = q.question_id + '-no';
                const ansAudioId = q.question_id + '-ans';

                return (
                  <div 
                    id={`card-${q.question_id}`}
                    key={q.question_id || index}
                    className={cn(
                      "bg-white border rounded-[28px] p-4 sm:p-5 transition-all duration-300 flex flex-col gap-4 relative shadow-sm",
                      isFocused && "ring-2 ring-indigo-500 border-transparent shadow-md scale-[1.01]",
                      isSkipped ? "border-slate-200/50 bg-slate-50/40 opacity-85" : "border-slate-100"
                    )}
                  >
                    {/* 🆕 上段エリア：問題番号、再生アイコン、スコア/スキップ表示を美しく統合 */}
                    <div className="flex items-center justify-between w-full pb-1 border-b border-slate-100/60">
                      {/* 左側：問題番号 ＆ シークエンス再生ボタンのモダン統合 */}
                      <div className="flex items-center gap-3">
                        {/* 問題番号はよりシャープに */}
                        <div className="text-slate-400 font-mono font-black text-base select-none leading-none tracking-tight">
                          #{String(index + 1).padStart(2, '0')}
                        </div>

                        {/* カプセル型の「一連再生」コントロールバッジ */}
                        <button
                          onClick={() => handlePlaySingleQuestion(q)}
                          className={cn(
                            "h-7 pl-2.5 pr-3 rounded-full flex items-center gap-1.5 transition-all active:scale-95 border select-none group whitespace-nowrap",
                            isFocused
                              ? "bg-indigo-600 border-transparent text-white shadow-xs shadow-indigo-200"
                              : "bg-slate-50 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/70 border-slate-200/50"
                          )}
                          title="一連の流れを再生"
                        >
                          {/* 再生/再生中アイコンの切り替え */}
                          {isFocused ? (
                            <span className="flex gap-0.5 items-center justify-center h-2.5 w-2.5 shrink-0">
                              <span className="w-0.5 h-full bg-current rounded-xs animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
                              <span className="w-0.5 h-full bg-current rounded-xs animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
                              <span className="w-0.5 h-2/3 bg-current rounded-xs animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
                            </span>
                          ) : (
                            <Play size={11} fill="currentColor" className="shrink-0 transition-transform group-hover:scale-110" />
                          )}

                          {/* 役割を明示するコンパクトなラベル */}
                          <span className={cn(
                            "text-[10px] font-black tracking-widest",
                            isFocused ? "text-indigo-100" : "text-slate-400 group-hover:text-indigo-500"
                          )}>
                            {isFocused ? "再生中" : "再生"}
                          </span>
                        </button>
                      </div>

                      {/* 右側：スキップ判定 or 個別スコアバッジ */}
                      <div>
                        {isSkipped ? (
                          <span className="h-7 inline-flex items-center justify-center gap-1 px-2.5 rounded-full text-[10px] font-black font-mono tracking-wider bg-amber-50 text-amber-600 border border-amber-200/50 whitespace-nowrap">
                            <SkipForward size={11} strokeWidth={2.5} />
                            スキップ
                          </span>
                        ) : (
                          typeof totalScore === 'number' && (
                            <button
                              type="button"
                              disabled={!analysisDetail}
                              onClick={() => {
                                if (!analysisDetail) return;
                                setFeedbackTarget({
                                  feedback: getFeedbackConfig(analysisDetail.score),
                                  analysis: {
                                    score: analysisDetail.score,
                                    summary: analysisDetail.summary,
                                    matches: analysisDetail.matches,
                                    issues: analysisDetail.issues,
                                  },
                                });
                              }}
                              title={analysisDetail ? "タップして発話フィードバックを見る" : undefined}
                              className={cn(
                                "h-7 inline-flex items-center justify-center gap-1 px-3 rounded-full text-[11px] font-black tracking-tight border shadow-3xs transition-transform leading-none whitespace-nowrap",
                                totalScore >= 80
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                                  : totalScore >= 50
                                  ? "bg-sky-50 text-sky-700 border-sky-200/60"
                                  : "bg-slate-50 text-slate-700 border-slate-200/60",
                                analysisDetail ? "cursor-pointer active:scale-95 hover:brightness-95" : "cursor-default"
                              )}
                            >
                              <ChartSpline size={12} strokeWidth={2.5} className="opacity-80 shrink-0" />
                              <span className="leading-none">スコア</span>
                              <span className="font-mono leading-none">{totalScore}</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Statementセクション */}
                    {q.statement_en && (
                      <div className="w-full text-left border-l-4 border-slate-200 pl-3 py-0.5 flex flex-col gap-1">
                        <PhraseAudioHeader
                          label="基本文"
                          tone="slate"
                          onPlay={() => handlePlayAudio(stAudioId, q.statement_en!, q.statement_voice, true)}
                          isLoading={globalPlayingId === stAudioId}
                          jaText={q.statement_ja}
                          isJaVisible={jaVisibleMap[stAudioId]}
                          onToggleJa={() => toggleJa(stAudioId)}
                        />
                        {jaVisibleMap[stAudioId] ? (
                          <p className="text-sm font-bold text-slate-600 leading-relaxed">{q.statement_ja}</p>
                        ) : (
                          <LookupText text={q.statement_en} className="text-sm font-bold text-slate-600 leading-relaxed" />
                        )}
                      </div>
                    )}

                    {/* Question / Instructionセクション */}
                    <div className="w-full text-left border-l-4 border-indigo-500 pl-3 py-0.5 flex flex-col gap-1">
                      <PhraseAudioHeader
                        label={isQuestionBased ? "質問文" : "指示文"}
                        tone="indigo"
                        onPlay={() => handlePlayAudio(qAudioId, q.question_en, q.question_voice, true)}
                        isLoading={globalPlayingId === qAudioId}
                        jaText={q.question_ja}
                        isJaVisible={jaVisibleMap[qAudioId]}
                        onToggleJa={() => toggleJa(qAudioId)}
                      />
                      {jaVisibleMap[qAudioId] ? (
                        <p className="text-lg sm:text-xl font-black text-slate-800 leading-snug tracking-tight">{q.question_ja}</p>
                      ) : (
                        <LookupText text={q.question_en} className="text-lg sm:text-xl font-black text-slate-800 leading-snug tracking-tight" />
                      )}
                    </div>

                    {/* Answer表示セクション */}
                    <div className="w-full pt-1">
                      {isSpeedModePayload ? (
                        <div className="w-full">
                          {scoreData.answer_type === '0' && (
                            <div className="text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-3 pr-3 py-2.5 rounded-r-xl flex flex-col gap-0.5 w-full">
                              <PhraseAudioHeader
                                label="解答文"
                                tone="emerald"
                                onPlay={() => handlePlayAudio(yesAudioId, q.answer_sentence_yes_en, q.answer_sentence_yes_voice, true)}
                                isLoading={globalPlayingId === yesAudioId}
                                jaText={q.answer_sentence_yes_ja}
                                isJaVisible={jaVisibleMap[yesAudioId]}
                                onToggleJa={() => toggleJa(yesAudioId)}
                              />
                              {jaVisibleMap[yesAudioId] ? (
                                <p className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">{q.answer_sentence_yes_ja}</p>
                              ) : (
                                <LookupText text={q.answer_sentence_yes_en} className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight" />
                              )}
                            </div>
                          )}
                          {scoreData.answer_type === '1' && (
                            <div className="text-left border-l-4 border-amber-500 bg-amber-50/20 pl-3 pr-3 py-2.5 rounded-r-xl flex flex-col gap-0.5 w-full">
                              <PhraseAudioHeader
                                label="解答文"
                                tone="amber"
                                onPlay={() => handlePlayAudio(noAudioId, q.answer_sentence_no_en!, q.answer_sentence_no_voice, true)}
                                isLoading={globalPlayingId === noAudioId}
                                jaText={q.answer_sentence_no_ja}
                                isJaVisible={jaVisibleMap[noAudioId]}
                                onToggleJa={() => toggleJa(noAudioId)}
                              />
                              {jaVisibleMap[noAudioId] ? (
                                <p className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight">{q.answer_sentence_no_ja}</p>
                              ) : (
                                <LookupText text={q.answer_sentence_no_en!} className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight" />
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-3 pr-3 py-2.5 rounded-r-xl flex flex-col gap-0.5">
                          <PhraseAudioHeader
                            label="解答文"
                            tone="emerald"
                            onPlay={() => handlePlayAudio(ansAudioId, q.answer_sentence_yes_en, q.answer_sentence_yes_voice, true)}
                            isLoading={globalPlayingId === ansAudioId}
                            jaText={q.answer_sentence_yes_ja}
                            isJaVisible={jaVisibleMap[ansAudioId]}
                            onToggleJa={() => toggleJa(ansAudioId)}
                          />
                          {jaVisibleMap[ansAudioId] ? (
                            <p className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">{q.answer_sentence_yes_ja}</p>
                          ) : (
                            <LookupText text={q.answer_sentence_yes_en} className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
            })}
          </div>
        </div>

        {/* ────────────── フッター：状況に応じて役割が切り替わる単一ボタン ────────────── */}
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100">
          {footerShowsRetry ? (
            // 履歴一覧からの遷移、または全て再生の完了/停止後：リトライへ
            <button
              onClick={() => router.push(`/training/sprint/play?mode=sprint&sprint_type=${scoreData.sprint_type}&content_id=${scoreData.content_id}`)}
              className="w-full h-13 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 border-none"
            >
              <span>スプリントをリトライ</span>
              <ArrowRight size={14} strokeWidth={3} />
            </button>
          ) : (
            // スプリント実施直後：まず全て再生から。停止/完了で自動的にリトライへ切り替わる
            // 🆕 発話評価直下の「スキップする」と同じ視覚パターンで、再生を挟まず即リトライする逃げ道を用意する
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handlePlayAll}
                className={cn(
                  "w-full h-13 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-none",
                  isBatchPlaying
                    ? "bg-indigo-50 text-indigo-600 shadow-none border border-indigo-200"
                    : "bg-indigo-600 text-white shadow-indigo-600/10 hover:bg-indigo-700"
                )}
              >
                {isBatchPlaying ? (
                  <span className="flex gap-0.5 items-center justify-center h-3 w-3 shrink-0">
                    <span className="w-0.5 h-full bg-current rounded-xs animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
                    <span className="w-0.5 h-full bg-current rounded-xs animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
                    <span className="w-0.5 h-2/3 bg-current rounded-xs animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
                  </span>
                ) : (
                  <PlayCircle size={16} strokeWidth={3} />
                )}
                <span>{isBatchPlaying ? "停止" : "全て再生"}</span>
              </button>

              <button
                type="button"
                onClick={() => router.push(`/training/sprint/play?mode=sprint&sprint_type=${scoreData.sprint_type}&content_id=${scoreData.content_id}`)}
                className="flex items-center justify-center gap-1.5 px-6 py-1.5 rounded-xl text-slate-400 hover:text-indigo-600 active:scale-[0.98] transition-all cursor-pointer border-none"
                title="再生せずにすぐリトライする"
              >
                <FastForward size={12} strokeWidth={2.5} />
                <span className="text-[11px] font-bold uppercase tracking-wider">スプリントをリトライ</span>
              </button>
            </div>
          )}
        </div>

        {/* 🆕 スコアタップ時の発話フィードバック（ドリルモードと同一のSpeechFeedbackModal） */}
        <SprintFeedback
          feedback={feedbackTarget?.feedback ?? null}
          analysis={feedbackTarget?.analysis ?? null}
          onClose={() => setFeedbackTarget(null)}
        />
      </div>

      <AudioResumeBanner status={resumeStatus} onResume={() => { unlockAudioContext(); }} />
    </div>
  );
};