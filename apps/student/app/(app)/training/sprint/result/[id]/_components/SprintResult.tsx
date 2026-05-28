'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy, Timer, CheckCircle2, Volume2, HelpCircle, MessageSquare, ArrowRight } from 'lucide-react';
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

  // 音声再生ヘルパー
  const handlePlayAudio = async (questionId: string, text: string, audioPath: string | null) => {
    setPlayingId(questionId);
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();

    if (audioPath) {
      const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
      const audio = new Audio(bucketUrl);
      audio.playbackRate = playbackRate;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => {
        ttsSpeak(text, playbackRate);
        setPlayingId(null);
      };
      await audio.play().catch(() => setPlayingId(null));
    } else {
      ttsSpeak(text, playbackRate);
      // 簡易判定（TTSの終了検知）
      setTimeout(() => setPlayingId(null), text.length * 80 + 1000);
    }
  };

  const isQuestionBased = scoreData.question_type === '0' || scoreData.question_type === '6';

  // Speedモードかつ回答タイプが指定されている場合（'0': YES, '1': NO）
  const speedModeLabel = scoreData.question_type === '0' 
    ? (scoreData.answer_type === '1' 
        ? { label: 'NO Focusing', class: 'bg-amber-500/20 text-amber-400 border-amber-400/20' }
        : { label: 'YES Focusing', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-400/20' }
      )
    : null;

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl bg-white border border-slate-100 rounded-[40px] shadow-xl flex flex-col overflow-hidden p-6 sm:p-10 space-y-8 animate-fade-in">
        
        {/* ────────────── ヘッダー ────────────── */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <button 
            onClick={() => router.push('/training/sprint')} // 💡 スプリント一覧やダッシュボードへ戻す
            className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-95 transition-all text-xs font-bold"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
            <span>スプリント一覧</span>
          </button>
          <div className="text-right">
            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em]">Sprint Result</span>
            <p className="text-xs font-bold text-slate-400">
              {new Date(scoreData.created_at).toLocaleDateString('ja-JP')} 実施
            </p>
          </div>
        </div>

        {/* ────────────── 核心スコアカード（要約） ────────────── */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-[32px] p-6 sm:p-8 relative overflow-hidden shadow-lg">
          <div className="absolute -right-6 -bottom-6 text-indigo-500/10 pointer-events-none transform -rotate-12">
            <Trophy size={160} strokeWidth={1} />
          </div>
          
          <div className="relative space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-400/20">
                  {courseTitle}
                </span>
                {speedModeLabel && (
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${speedModeLabel.class}`}>
                    {speedModeLabel.label}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-black tracking-tight mt-3">セッション完了！</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-slate-400">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span className="text-[11px] font-bold tracking-wider">総回答数</span>
                </div>
                <p className="text-2xl font-black font-mono tracking-tight text-white">
                  {scoreData.total_answered} <span className="text-xs font-bold text-slate-400">問</span>
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-slate-400">
                  <Timer size={13} className="text-indigo-400" />
                  <span className="text-[11px] font-bold tracking-wider">制限時間</span>
                </div>
                <p className="text-2xl font-black font-mono tracking-tight text-white">
                  {scoreData.time_limit_sec} <span className="text-xs font-bold text-slate-400">秒</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ────────────── 今回の出題リスト（ドリルカード風アライン） ────────────── */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 tracking-wider uppercase pl-1">
            Review Timeline ({questions.length})
          </h3>

          <div className="space-y-6">
            {questions.map((q, index) => {
              const isSpeedModePayload = scoreData.question_type === '0' && q.answer_sentence_no;

              return (
                <div 
                  key={q.question_id || index}
                  className="bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded-[28px] p-5 sm:p-6 transition-all duration-200 flex flex-col gap-4 relative"
                >
                  {/* インデックスバッジ */}
                  <div className="absolute top-4 right-5 h-5 px-2 flex items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm">
                    <span className="font-mono text-[10px] font-black text-slate-500">
                      #{index + 1}
                    </span>
                  </div>

                  {/* 【A】基本文（グレー）※ドリル仕様を踏襲 */}
                  {q.statement && (
                    <div className="w-full text-left border-l-4 border-slate-200 pl-3 py-0.5">
                      <div className="flex items-center gap-x-1.5 text-slate-400 mb-1">
                        <MessageSquare size={12} />
                        <span className="text-[10px] font-bold tracking-wider">基本文</span>
                        <button 
                          onClick={() => handlePlayAudio(q.question_id + '-st', q.statement, q.statement_voice)}
                          className={`w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                            playingId === q.question_id + '-st' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-500 hover:bg-slate-100'
                          }`}
                        >
                          <Volume2 size={12} />
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed">
                        {q.statement}
                      </p>
                    </div>
                  )}

                  {/* 【B】質問 / 指示（インディゴ） */}
                  <div className="w-full text-left border-l-4 border-indigo-500 pl-3 py-0.5">
                    <div className="flex items-center gap-x-1.5 text-indigo-500 mb-1">
                      <HelpCircle size={12} strokeWidth={2.5} />
                      <span className="text-[10px] font-bold tracking-wider">
                        {isQuestionBased ? "質問文" : "指示文"}
                      </span>
                      <button 
                        onClick={() => handlePlayAudio(q.question_id + '-q', q.question, q.question_voice)}
                        className={`w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                          playingId === q.question_id + '-q' ? 'text-indigo-600 bg-indigo-50' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
                      >
                        <Volume2 size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                    <p className="text-base sm:text-lg font-black text-slate-800 leading-snug tracking-tight">
                      {q.question}
                    </p>
                  </div>

                  {/* 【C】解答（サクセスエメラルド & アンバー） */}
                  {isSpeedModePayload ? (
                    /* Speed専用の2ペインアライン */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-1">
                      <div className="text-left border-l-4 border-emerald-500 bg-emerald-50/10 pl-3 pr-2 py-1.5 rounded-r-xl">
                        <div className="flex items-center gap-x-1 mb-1 text-emerald-600">
                          <CheckCircle2 size={11} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold tracking-wider">YES</span>
                          <button 
                            onClick={() => handlePlayAudio(q.question_id + '-yes', q.answer_sentence_yes, q.answer_sentence_yes_voice)}
                            className="w-4 h-4 flex items-center justify-center text-emerald-500"
                          >
                            <Volume2 size={11} />
                          </button>
                        </div>
                        <p className="text-xs sm:text-sm font-black text-emerald-700 tracking-tight">
                          {q.answer_sentence_yes}
                        </p>
                      </div>

                      <div className="text-left border-l-4 border-amber-500 bg-amber-50/10 pl-3 pr-2 py-1.5 rounded-r-xl">
                        <div className="flex items-center gap-x-1 mb-1 text-amber-600">
                          <CheckCircle2 size={11} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold tracking-wider">NO</span>
                          <button 
                            onClick={() => handlePlayAudio(q.question_id + '-no', q.answer_sentence_no, q.answer_sentence_no_voice)}
                            className="w-4 h-4 flex items-center justify-center text-amber-500"
                          >
                            <Volume2 size={11} />
                          </button>
                        </div>
                        <p className="text-xs sm:text-sm font-black text-amber-700 tracking-tight">
                          {q.answer_sentence_no}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* 通常の一択解答 */
                    <div className="w-full text-left border-l-4 border-emerald-500 bg-emerald-50/10 pl-3 pr-3 py-2 rounded-r-xl pt-1">
                      <div className="flex items-center gap-x-1.5 text-emerald-600 mb-1">
                        <CheckCircle2 size={11} strokeWidth={2.5} />
                        <span className="text-[9px] font-bold tracking-wider">正しい解答例</span>
                        <button 
                          onClick={() => handlePlayAudio(q.question_id + '-ans', q.answer_sentence_yes, q.answer_sentence_yes_voice)}
                          className={`w-4 h-4 flex items-center justify-center rounded-full transition-colors ${
                            playingId === q.question_id + '-ans' ? 'text-indigo-600' : 'text-emerald-500'
                          }`}
                        >
                          <Volume2 size={11} strokeWidth={2.5} />
                        </button>
                      </div>
                      <p className="text-sm font-black text-emerald-600 tracking-tight">
                        {q.answer_sentence_yes}
                      </p>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

        {/* ────────────── フッターアクション ────────────── */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={() => router.push('/training/sprint')}
            className="h-12 px-6 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-md shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>トレーニング選択に戻る</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </div>
  );
};