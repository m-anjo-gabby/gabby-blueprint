'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy, Timer, CheckCircle2, Volume2, HelpCircle, MessageSquare, ArrowRight, Zap, PlayCircle, Hourglass } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';

interface SprintResultProps {
  scoreData: {
    self_sprint_id: string;
    question_type: string;
    answer_type: string;
    difficulty_level: number;
    time_limit_sec: number;
    total_answered: number;
    created_at: string;
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
  const { speak: ttsSpeak } = useWebSpeech();
  const { playbackRate } = usePlayAudioSpeech();
  
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isBatchPlaying, setIsBatchPlaying] = useState(false);
  const isBatchPlayingRef = useRef(false); // ループ制御用のRef
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // 現在再生中のAudioオブジェクトを保持

  // すべての音声を停止するヘルパー関数
  const stopAllAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setPlayingId(null);
  }, []);

  // 音声再生ヘルパー
  const handlePlayAudio = (
    questionId: string, 
    text: string, 
    audioPath: string | null,
    isManualClick = false
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (isManualClick) {
        isBatchPlayingRef.current = false;
        setIsBatchPlaying(false);
      }
      setPlayingId(questionId);
      stopAllAudio(); // 新しい音声を再生する前に、既存の音声をすべて停止

      if (audioPath) {
        const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
        const audio = new Audio(bucketUrl);
        audio.playbackRate = playbackRate;
        currentAudioRef.current = audio; // Audioオブジェクトをrefに保存
        audio.onended = () => { currentAudioRef.current = null; setPlayingId(null); resolve(); };
        audio.onerror = () => { currentAudioRef.current = null; ttsSpeak(text, playbackRate); setPlayingId(null); resolve(); };
        audio.play().catch(() => { currentAudioRef.current = null; setPlayingId(null); resolve(); });
      } else {
        ttsSpeak(text, playbackRate);
        // TTSの終了検知を簡易的にシミュレート
        const duration = text.length * 80 + 1000;
        setTimeout(() => { setPlayingId(null); resolve(); }, duration);
      }
    });
  };

  // 一括再生
  const handlePlayAll = async () => {
    if (isBatchPlayingRef.current) {
      isBatchPlayingRef.current = false;
      setIsBatchPlaying(false);
      stopAllAudio();
      return;
    }

    isBatchPlayingRef.current = true;
    setIsBatchPlaying(true);

    // question_type が '0' (Speed) 以外の場合は基本文を再生するフラグ
    const isSpeedMode = scoreData.question_type === '0';

    try {
      for (const q of questions) {
        if (!isBatchPlayingRef.current) break;

        // 💡 改善点1: Speedモード以外、かつ基本文(statement)が存在する場合は最初に再生
        if (!isSpeedMode && q.statement) {
          await handlePlayAudio(q.question_id + '-st', q.statement, q.statement_voice);
          if (!isBatchPlayingRef.current) break;
          await new Promise(r => setTimeout(r, 400));
        }

        if (!isBatchPlayingRef.current) break;
        // 2. 質問を再生
        await handlePlayAudio(q.question_id + '-q', q.question, q.question_voice);
        if (!isBatchPlayingRef.current) break;
        await new Promise(r => setTimeout(r, 400));
        
        if (!isBatchPlayingRef.current) break;
        // 3. 解答を再生
        const ansText = scoreData.answer_type === '1' ? q.answer_sentence_no : q.answer_sentence_yes;
        const ansVoice = scoreData.answer_type === '1' ? q.answer_sentence_no_voice : q.answer_sentence_yes_voice;
        await handlePlayAudio(q.question_id + '-ans', ansText ?? "", ansVoice);
        if (!isBatchPlayingRef.current) break;
        await new Promise(r => setTimeout(r, 800));
      }
    } finally {
      isBatchPlayingRef.current = false;
      setIsBatchPlaying(false);
    }
  };

  const isQuestionBased = scoreData.question_type === '0' || scoreData.question_type === '6';

  // Speedモードかつ回答タイプが指定されている場合（'0': YES, '1': NO）
  const speedModeLabel = scoreData.question_type === '0' && (
    <div className={cn("px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider",
      scoreData.answer_type === '1' 
        ? "bg-amber-50 border-amber-200 text-amber-600"
        : "bg-emerald-50 border-emerald-200 text-emerald-600"
    )}>
      {scoreData.answer_type === '1' ? 'NOで回答' : 'YESで回答'}
    </div>
  );

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-blue-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-100 rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        
        {/* ────────────── ヘッダー：セッション情報 (コンパクト化) ────────────── */}
        <div className="shrink-0 bg-blue-600 p-5 sm:p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Trophy size={120} strokeWidth={1} />
          </div>
          
          <div className="relative space-y-5">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => router.push('/training/sprint')}
                className="h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/10"
              >
                <ChevronLeft size={12} strokeWidth={3} />
                <span>戻る</span>
              </button>
              <div className="text-right">
                <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em]">セッション記録</span>
                <p className="text-[9px] font-bold text-blue-100 opacity-80">
                  {new Date(scoreData.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-none">
                  {courseTitle}
                </h1>
                {speedModeLabel}
              </div>

              <div className="flex items-center gap-5 pt-2 border-t border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <Zap size={16} className="text-blue-200" fill="currentColor" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-blue-200 uppercase tracking-widest">回答数</span>
                    <span className="text-lg font-black font-mono leading-none">{scoreData.total_answered}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <Timer size={16} className="text-blue-200" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-blue-200 uppercase tracking-widest">制限時間</span>
                    <span className="text-lg font-black font-mono leading-none">{scoreData.time_limit_sec}s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：出題リスト（スクロールエリア、問題情報拡大） ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 sm:p-6">
          <div className="max-w-xl mx-auto space-y-3">
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase pl-1 flex items-center gap-2">
              <CheckCircle2 size={14} strokeWidth={3} className="text-blue-500" />
              回答履歴 ({questions.length})
            </h3>

            <div className="space-y-3">
              {questions.map((q, index) => {
                const isSpeedModePayload = scoreData.question_type === '0' && q.answer_sentence_no;

                return (
                  <div 
                    key={q.question_id || index}
                    className="bg-white border border-slate-100 rounded-[28px] p-4 sm:p-5 transition-all duration-200 flex flex-col gap-4 relative shadow-sm"
                  >
                    {/* インデックス */}
                    <div className="absolute top-4 right-5 text-slate-200 italic font-black text-xl select-none">
                      {String(index + 1).padStart(2, '0')}
                    </div>

                    {/* 基本文 */}
                    {q.statement && (
                      <div className="w-full text-left border-l-4 border-slate-200 pl-3 py-0.5">
                        <div className="flex items-center gap-x-1.5 text-slate-400 mb-1.5">
                          <MessageSquare size={14} />
                          <span className="text-xs font-bold tracking-wider">基本文</span>
                          <button 
                            onClick={() => handlePlayAudio(q.question_id + '-st', q.statement!, q.statement_voice, true)}
                            className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", playingId === q.question_id + '-st' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100')}
                          >
                            <Volume2 size={16} />
                          </button>
                        </div>
                        <p className="text-sm font-bold text-slate-600 leading-relaxed">{q.statement}</p>
                      </div>
                    )}

                    {/* 質問 / 指示 */}
                    <div className="w-full text-left border-l-4 border-blue-500 pl-3 py-0.5">
                      <div className="flex items-center gap-x-1.5 text-blue-500 mb-1.5">
                        <HelpCircle size={14} strokeWidth={2.5} />
                        <span className="text-xs font-bold tracking-wider">{isQuestionBased ? "質問" : "指示"}</span>
                        <button 
                          onClick={() => handlePlayAudio(q.question_id + '-q', q.question, q.question_voice, true)}
                          className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", playingId === q.question_id + '-q' ? 'text-blue-600 bg-blue-50' : 'text-blue-400 hover:text-blue-600 hover:bg-blue-50')}
                        >
                          <Volume2 size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-slate-800 leading-snug tracking-tight">{q.question}</p>
                    </div>

                    {/* 解答 */}
                    <div className="w-full pt-1">
                      {isSpeedModePayload ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                          {scoreData.answer_type === '0' && ( // YES主軸の場合のみYESを表示
                            <div className="text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-3 pr-2 py-2 rounded-r-xl">
                              <div className="flex items-center gap-x-1 mb-1 text-emerald-600">
                                <span className="text-xs font-black tracking-widest uppercase">解答</span>
                                <button onClick={() => handlePlayAudio(q.question_id + '-yes', q.answer_sentence_yes, q.answer_sentence_yes_voice, true)} className="w-6 h-6 flex items-center justify-center text-emerald-500"><Volume2 size={16} /></button>
                              </div>
                              <p className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">{q.answer_sentence_yes}</p>
                            </div>
                          )}
                          {scoreData.answer_type === '1' && ( // NO主軸の場合のみNOを表示
                            <div className="text-left border-l-4 border-amber-500 bg-amber-50/20 pl-3 pr-2 py-2 rounded-r-xl">
                              <div className="flex items-center gap-x-1 mb-1 text-amber-600">
                                <span className="text-xs font-black tracking-widest uppercase">解答</span>
                                <button onClick={() => handlePlayAudio(q.question_id + '-no', q.answer_sentence_no!, q.answer_sentence_no_voice, true)} className="w-6 h-6 flex items-center justify-center text-amber-500"><Volume2 size={16} /></button>
                              </div>
                              <p className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight">{q.answer_sentence_no}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-3 pr-3 py-2.5 rounded-r-xl">
                          <div className="flex items-center gap-x-1.5 text-emerald-600 mb-1.5">
                            <span className="text-xs font-black tracking-widest uppercase">解答</span>
                            <button onClick={() => handlePlayAudio(q.question_id + '-ans', q.answer_sentence_yes, q.answer_sentence_yes_voice, true)} className={cn("w-6 h-6 flex items-center justify-center rounded-full transition-colors", playingId === q.question_id + '-ans' ? 'text-blue-600' : 'text-emerald-500')}><Volume2 size={16} strokeWidth={2.5} /></button>
                          </div>
                          <p className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">{q.answer_sentence_yes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ────────────── フッター：固定アクション ────────────── */}
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100 flex items-center justify-center gap-3">
          <button // 一括再生ボタン
            onClick={handlePlayAll}
            className={cn(
              "flex-1 max-w-[160px] h-12 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 border-2",
              isBatchPlaying ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <PlayCircle size={16} strokeWidth={3} className={isBatchPlaying ? "animate-pulse" : "text-slate-400"} />
            <span>{isBatchPlaying ? "停止" : "一括再生"}</span>
          </button>
          <button
            onClick={() => router.push('/training/sprint/play')}
            className="flex-[2] max-w-sm h-12 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>Next Sprint</span>
            <ArrowRight size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};