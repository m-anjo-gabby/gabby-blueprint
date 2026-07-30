// apps\student\app\(app)\training\sprint\result\[id]\_components\SprintResult.tsx
'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy, CheckCircle2, Volume2, Loader2, MessageSquare, ArrowRight, PlayCircle, Languages, FileCheck2, Award, SkipForward, Mic, ChartSpline, Play, Home } from 'lucide-react';
import { cn } from "@/lib/utils";
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { setAudioSessionPlayback } from '@gabby/lib';

import { LookupText } from '@/components/common/LookupText';

// 🆕 answered_history 内の個別アイテムの型定義
interface SprintHistoryItem {
  seq_no: number;
  group_id: string;
  question_id: string;
  is_skipped: boolean;
  assessment: {
    total_score: number;
  } | null;
}

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
}

export const SprintResult: React.FC<SprintResultProps> = ({
  scoreData,
  questions,
  courseTitle,
}) => {
  const router = useRouter();
  
  // 🆕 拡張された共通フックの呼び出し。コンポーネント独自の重複AudioContextロジックをリプレイス
  const { play: playAudioSpeech, stop: stopAudioSpeech, isPlaying: globalPlayingId } = usePlayAudioSpeech();
  
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isBatchPlaying, setIsBatchPlaying] = useState(false);
  const [jaVisibleMap, setJaVisibleMap] = useState<Record<string, boolean>>({});
 
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
 
  const toggleJa = (key: string) => {
    setJaVisibleMap(prev => ({ ...prev, [key]: !prev[key] }));
  };
 
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
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">
        
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
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-white text-slate-400 border border-slate-100/80 shadow-xs hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
                title="履歴に戻る"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <button 
                onClick={() => router.push('/dashboard')}
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-white text-slate-400 border border-slate-100/80 shadow-xs hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
                title="ダッシュボードに戻る"
              >
                <Home size={16} strokeWidth={2.5} />
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
            <div className="flex items-center gap-x-5 text-slate-700 font-sans">
              {/* 回答数 */}
              <div className="flex items-center gap-1.5 h-5">
                <CheckCircle2 size={13} fill="none" strokeWidth={2.5} className="text-indigo-500 shrink-0" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">回答</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{displayTotalAnswered}</span>
              </div>
              {/* 発話数 */}
              <div className="flex items-center gap-1.5 h-5">
                <Mic size={13} className="text-rose-500 shrink-0 stroke-[2.5]" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">発話</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{displayTotalAssessment}</span>
              </div>
              {/* 平均スコア */}
              <div className="flex items-center gap-1.5 h-5">
                <ChartSpline size={13} strokeWidth={2.5} className="text-amber-500 shrink-0" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">平均スコア</span>
                <span className="text-sm font-black text-indigo-600 font-mono leading-none inline-flex items-baseline">
                  {displayTotalAssessment > 0 ? (
                    <>
                      {displayAverageScore}
                      <span className="text-[9px] font-medium text-slate-400 ml-0.5 font-sans leading-none">/100</span>
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
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase pl-1 flex items-center gap-2">
              Answer History
            </h3>

            <div className="space-y-3">
              {questions.map((q, index) => {
                const isSpeedModePayload = scoreData.question_type === '0' && q.answer_sentence_no_en;
                const isFocused = focusedCardId === q.question_id;

                // 🆕 サーバーサイドからマッピングされて同期している履歴データを取り出す
                const historyItem = scoreData.answered_history?.[index];
                const isSkipped = historyItem?.is_skipped ?? false;
                const totalScore = historyItem?.assessment?.total_score;

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
                            "h-6 pl-2 pr-2.5 rounded-full flex items-center gap-1.5 transition-all active:scale-95 border select-none group",
                            isFocused 
                              ? "bg-indigo-600 border-transparent text-white shadow-xs shadow-indigo-200" 
                              : "bg-slate-50 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/70 border-slate-200/50"
                          )}
                          title="一連の流れを再生"
                        >
                          {/* 再生/再生中アイコンの切り替え */}
                          {isFocused ? (
                            <span className="flex gap-0.5 items-center justify-center h-2.5 w-2.5">
                              <span className="w-0.5 h-full bg-current rounded-xs animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
                              <span className="w-0.5 h-full bg-current rounded-xs animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
                              <span className="w-0.5 h-2/3 bg-current rounded-xs animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
                            </span>
                          ) : (
                            <Play size={10} fill="currentColor" className="shrink-0 transition-transform group-hover:scale-110" />
                          )}
                          
                          {/* 役割を明示するコンパクトなラベル */}
                          <span className={cn(
                            "text-[9px] font-black tracking-widest mt-[-0.5px]",
                            isFocused ? "text-indigo-100" : "text-slate-400 group-hover:text-indigo-500"
                          )}>
                            {isFocused ? "再生中" : "再生"}
                          </span>
                        </button>
                      </div>

                      {/* 右側：スキップ判定 or 個別スコアバッジ */}
                      <div>
                        {isSkipped ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black font-mono tracking-wider bg-amber-50 text-amber-600 border border-amber-200/50">
                            <SkipForward size={10} strokeWidth={2.5} />
                            スキップ
                          </span>
                        ) : (
                          typeof totalScore === 'number' && (
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono tracking-tight border shadow-3xs",
                              totalScore >= 80 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                                : totalScore >= 50
                                ? "bg-sky-50 text-sky-700 border-sky-200/60"
                                : "bg-slate-50 text-slate-700 border-slate-200/60"
                            )}>
                              スコア {totalScore}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Statementセクション */}
                    {q.statement_en && (
                      <div className="w-full text-left border-l-4 border-slate-200 pl-3 py-0.5 flex flex-col gap-1">
                        <div className="flex items-center w-full mb-1">
                          <div className="flex items-center gap-x-1.5 text-slate-400">
                            <span className="text-xs font-bold tracking-wider">基本文</span>
                            <button 
                              onClick={() => handlePlayAudio(stAudioId, q.statement_en!, q.statement_voice, true)}
                              className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", globalPlayingId === stAudioId ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-500 hover:bg-slate-100')}
                            >
                              {globalPlayingId === stAudioId ? (
                                <Loader2 size={16} className="animate-spin text-indigo-600" />
                              ) : (
                                <Volume2 size={16} />
                              )}
                            </button>
                            {q.statement_ja && (
                              <button
                                onClick={() => toggleJa(stAudioId)}
                                className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all", jaVisibleMap[stAudioId] ? "bg-slate-100 text-indigo-600" : "text-slate-300 hover:text-slate-400 hover:bg-slate-50")}
                              >
                                <Languages size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        {jaVisibleMap[stAudioId] ? (
                          <p className="text-sm font-bold text-slate-600 leading-relaxed">{q.statement_ja}</p>
                        ) : (
                          <LookupText text={q.statement_en} className="text-sm font-bold text-slate-600 leading-relaxed" />
                        )}
                      </div>
                    )}

                    {/* Question / Instructionセクション */}
                    <div className="w-full text-left border-l-4 border-indigo-500 pl-3 py-0.5 flex flex-col gap-1">
                      <div className="flex items-center w-full mb-1">
                        <div className="flex items-center gap-x-1.5 text-indigo-500">
                          <span className="text-xs font-bold tracking-wider">{isQuestionBased ? "質問文" : "指示文"}</span>
                          <button 
                            onClick={() => handlePlayAudio(qAudioId, q.question_en, q.question_voice, true)}
                            className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", globalPlayingId === qAudioId ? 'text-indigo-600 bg-indigo-50' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50')}
                          >
                            {globalPlayingId === qAudioId ? (
                              <Loader2 size={16} strokeWidth={2.5} className="animate-spin text-indigo-600" />
                            ) : (
                              <Volume2 size={16} strokeWidth={2.5} />
                            )}
                          </button>
                          {q.question_ja && (
                            <button
                              onClick={() => toggleJa(qAudioId)}
                              className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all", jaVisibleMap[qAudioId] ? "bg-indigo-50 text-indigo-600" : "text-indigo-200 hover:text-indigo-400 hover:bg-indigo-50")}
                            >
                              <Languages size={14} />
                            </button>
                          )}
                        </div>
                      </div>
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
                              <div className="flex items-center w-full mb-1">
                                <div className="flex items-center gap-x-1.5 text-emerald-600">
                                  <span className="text-xs font-black tracking-widest uppercase">解答文</span>
                                  <button 
                                    onClick={() => handlePlayAudio(yesAudioId, q.answer_sentence_yes_en, q.answer_sentence_yes_voice, true)} 
                                    className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", globalPlayingId === yesAudioId ? 'text-indigo-600 bg-indigo-50' : 'text-emerald-500 hover:bg-emerald-50')}
                                  >
                                    {globalPlayingId === yesAudioId ? (
                                      <Loader2 size={16} className="animate-spin text-indigo-600" />
                                    ) : (
                                      <Volume2 size={16} />
                                    )}
                                  </button>
                                  {q.answer_sentence_yes_ja && (
                                    <button
                                      onClick={() => toggleJa(yesAudioId)}
                                      className={cn("w-5 h-5 flex items-center justify-center rounded-md transition-all", jaVisibleMap[yesAudioId] ? "bg-emerald-100 text-emerald-600" : "text-emerald-300/60 hover:text-emerald-600 hover:bg-emerald-100/50")}
                                    >
                                      <Languages size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {jaVisibleMap[yesAudioId] ? (
                                <p className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">{q.answer_sentence_yes_ja}</p>
                              ) : (
                                <LookupText text={q.answer_sentence_yes_en} className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight" />
                              )}
                            </div>
                          )}
                          {scoreData.answer_type === '1' && (
                            <div className="text-left border-l-4 border-amber-500 bg-amber-50/20 pl-3 pr-3 py-2.5 rounded-r-xl flex flex-col gap-0.5 w-full">
                              <div className="flex items-center w-full mb-1">
                                <div className="flex items-center gap-x-1.5 text-amber-600">
                                  <span className="text-xs font-black tracking-widest uppercase">解答文</span>
                                  <button 
                                    onClick={() => handlePlayAudio(noAudioId, q.answer_sentence_no_en!, q.answer_sentence_no_voice, true)} 
                                    className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", globalPlayingId === noAudioId ? 'text-indigo-600 bg-indigo-50' : 'text-amber-500 hover:bg-amber-50')}
                                  >
                                    {globalPlayingId === noAudioId ? (
                                      <Loader2 size={16} className="animate-spin text-indigo-600" />
                                    ) : (
                                      <Volume2 size={16} />
                                    )}
                                  </button>
                                  {q.answer_sentence_no_ja && (
                                    <button
                                      onClick={() => toggleJa(noAudioId)}
                                      className={cn("w-5 h-5 flex items-center justify-center rounded-md transition-all", jaVisibleMap[noAudioId] ? "bg-amber-100 text-amber-600" : "text-amber-300/60 hover:text-amber-600 hover:bg-amber-100/50")}
                                    >
                                      <Languages size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
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
                          <div className="flex items-center w-full mb-1">
                            <div className="flex items-center gap-x-1.5 text-emerald-600">
                              <span className="text-xs font-black tracking-widest uppercase">解答文</span>
                              <button 
                                onClick={() => handlePlayAudio(ansAudioId, q.answer_sentence_yes_en, q.answer_sentence_yes_voice, true)} 
                                className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", globalPlayingId === ansAudioId ? 'text-indigo-600 bg-indigo-50' : 'text-emerald-500 hover:bg-emerald-50')}
                              >
                                {globalPlayingId === ansAudioId ? (
                                  <Loader2 size={16} strokeWidth={2.5} className="animate-spin text-indigo-600" />
                                ) : (
                                  <Volume2 size={16} strokeWidth={2.5} />
                                )}
                              </button>
                              {q.answer_sentence_yes_ja && (
                                <button
                                  onClick={() => toggleJa(ansAudioId)}
                                  className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all", jaVisibleMap[ansAudioId] ? "bg-emerald-100 text-emerald-600" : "text-emerald-300/60 hover:text-emerald-600 hover:bg-emerald-100/50")}
                                >
                                  <Languages size={14} />
                                </button>
                              )}
                            </div>
                          </div>
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
        </div>

        {/* ────────────── フッター ────────────── */}
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100 flex items-center justify-center gap-3">
          <button
            onClick={handlePlayAll}
            className={cn(
              "flex-1 max-w-[160px] h-12 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 border-2",
              isBatchPlaying ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <PlayCircle size={16} strokeWidth={3} className={isBatchPlaying ? "animate-pulse" : "text-slate-400"} />
            <span>{isBatchPlaying ? "停止" : "全て再生"}</span>
          </button>
          <button
            onClick={() => router.push(`/training/sprint/play?mode=sprint&sprint_type=${scoreData.sprint_type}&content_id=${scoreData.content_id}`)}
            className="flex-[2] max-w-sm h-12 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 border-none"
          >
            <span>スプリントをリトライ</span>
            <ArrowRight size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};