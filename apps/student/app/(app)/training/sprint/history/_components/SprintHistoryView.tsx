'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Calendar, Zap, ArrowRight, History, Timer, ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from "@/lib/utils";
import { QUESTION_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoMonthInZone, formatZonedDate } from '@gabby/lib/date/date';

interface HistorySession {
  self_sprint_id: string;
  question_type: string;
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  insert_date: string;
}

interface SprintHistoryViewProps {
  initialData: HistorySession[];
  targetMonth: string; // 形式: "YYYY-MM"
}

export const SprintHistoryView: React.FC<SprintHistoryViewProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  // 🌍 ユーザーマスタからタイムゾーンを取得（未設定時は Asia/Tokyo にフォールバック）
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  // 🌍 ユーザーのタイムゾーンに基づいた「今月（YYYY-MM）」文字列を生成
  const currentMonthStr = useMemo(() => {
    return toIsoMonthInZone(new Date(), timezone);
  }, [timezone]);

  // 🎯 初期レンダリング時に URL パラメータから展開すべき日付を特定する
  const [expandedDates, setExpandedDates] = useState<string[]>(() => {
    if (!focusId || !initialData.length) return [];
    const targetSession = initialData.find(s => s.self_sprint_id === focusId);
    if (targetSession) {
      // 💡 外部関数を呼ばず、直接タイムゾーン関数を使用
      return [formatZonedDate(targetSession.insert_date, timezone)];
    }
    return [];
  });

  // 🎯 スクロール処理のみを Effect で行う
  useEffect(() => {
    if (!focusId || initialData.length === 0) return;

    const timer = setTimeout(() => {
      const element = document.getElementById(`session-${focusId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [focusId, initialData.length]);

  // 💡 日付ごとにグループ化（React Compiler が確実に自動追随できるよう最適化）
  const groupedData = useMemo(() => {
    const groups: Record<string, HistorySession[]> = {};
    
    initialData.forEach(session => {
      // 💡 `formatDateKey` の代わりに直接インライン展開することで、不整合を根本排除
      const dateStr = formatZonedDate(session.insert_date, timezone);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(session);
    });

    // 各日のセッションを「実施順（昇順）」にソート
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => new Date(a.insert_date).getTime() - new Date(b.insert_date).getTime());
    });

    return groups;
  }, [initialData, timezone]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const [year, month] = targetMonth.split('-').map(Number);
    let newYear = year;
    let newMonth = direction === 'prev' ? month - 1 : month + 1;

    if (newMonth === 0) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth === 13) {
      newMonth = 1;
      newYear += 1;
    }

    const targetMonthStr = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    router.push(`/training/sprint/history?month=${targetMonthStr}`);
  };

  const [displayYear, displayMonth] = targetMonth.split('-');
  const isNotCurrentMonth = targetMonth !== currentMonthStr;

  // ソートの最適化：標準化した文字列（YYYY/MM/DD）で高速に降順ソート
  const sortedDates = useMemo(() => {
    return Object.keys(groupedData).sort((a, b) => b.localeCompare(a));
  }, [groupedData]);

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">
        
        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-4">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <History size={115} strokeWidth={1.2} className="text-indigo-600" />
          </div>

          <div className="relative flex items-center justify-between">
            <button
              onClick={() => router.push('/training/performance')}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100/80 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
              title="パフォーマンスに戻る"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            
            <div className="text-right">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] font-mono block">
                Sprint History
              </span>
              <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                スプリント履歴の詳細ログ
              </p>
            </div>
          </div>

          {/* 月移動：カプセル型UI */}
          <div className="relative flex items-center justify-center pt-1">
            <div className="inline-flex items-center bg-white border border-slate-200/80 shadow-sm rounded-2xl p-1 relative">
              <button 
                onClick={() => handleMonthChange('prev')} 
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all active:scale-90 flex items-center justify-center"
                title="前月"
              >
                <ArrowLeft size={14} strokeWidth={2.5} />
              </button>
              
              <div className="px-5 text-center min-w-[120px] select-none border-x border-slate-100">
                <span className="text-[9px] font-mono font-bold text-slate-400 tracking-wider block leading-none mb-0.5">
                  {displayYear}
                </span>
                <span className="text-sm font-black text-slate-800 font-mono tracking-tight">
                  {parseInt(displayMonth)}月
                </span>
              </div>

              <button 
                onClick={() => handleMonthChange('next')} 
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all active:scale-90 flex items-center justify-center"
                title="来月"
              >
                <ArrowRight size={14} strokeWidth={2.5} />
              </button>

              {/* 「今月」ボタン */}
              <AnimatePresence>
                {isNotCurrentMonth && (
                  <motion.button
                    initial={{ opacity: 0, x: -6, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => router.push(`/training/sprint/history?month=${currentMonthStr}`)}
                    className="absolute left-full ml-3 px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-white border border-indigo-100 rounded-lg hover:bg-indigo-50/80 hover:border-indigo-200 transition-all active:scale-95 shadow-xs font-sans cursor-pointer whitespace-nowrap"
                    title="現在の月に戻る"
                  >
                    今月
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：リストエリア ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 sm:p-6">
          <div className="max-w-xl mx-auto space-y-3">
          {sortedDates.length === 0 ? (
            <div className="bg-white rounded-[32px] p-12 text-center border border-dashed border-slate-200 mt-4">
              <Calendar size={40} className="mx-auto text-slate-200 mb-4" />
              <p className="text-sm font-bold text-slate-400">この月のスプリント履歴はありません</p>
            </div>
          ) : (
            sortedDates.map((date, index) => {
              const sessions = groupedData[date];
              const isExpanded = expandedDates.includes(date);
              const dayNo = sortedDates.length - index;
              const totalAnswersDay = sessions.reduce((acc, s) => acc + s.total_answered, 0);

              return (
                <div key={date} className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                  <button 
                    onClick={() => toggleDate(date)}
                    className="w-full p-5 sm:p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 text-left">
                      <div className="w-12 h-12 bg-indigo-50/40 border border-indigo-100/50 rounded-2xl flex items-center justify-center text-indigo-500/90 font-black text-base font-mono shrink-0 select-none">
                        {dayNo}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 tracking-tight mb-1.5">{date}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                          <span>
                            {sessions.length} {sessions.length === 1 ? 'Sprint' : 'Sprints'}
                          </span>
                          <span className="w-1 h-1 bg-slate-300 rounded-full" />
                          <span className="text-amber-500 flex items-center gap-0.5">
                            {totalAnswersDay} {totalAnswersDay === 1 ? 'Answer' : 'Answers'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={cn("transition-transform duration-300", isExpanded ? "rotate-180" : "")}>
                      <ChevronRight size={20} className="text-slate-300" />
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="border-t border-slate-50 bg-slate-50/30"
                      >
                        <div className="p-4 sm:p-5 space-y-2">
                          {sessions.map((session, idx) => {
                            const typeInfo = QUESTION_TYPES[session.question_type as keyof typeof QUESTION_TYPES];
                            const isSpeedMode = session.question_type === '0';

                            return (
                              <div 
                                key={session.self_sprint_id}
                                id={`session-${session.self_sprint_id}`}
                                onClick={() => router.push(`/training/sprint/result/${session.self_sprint_id}`)}
                                className={cn(
                                  "flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all group cursor-pointer",
                                  focusId === session.self_sprint_id && "ring-2 ring-blue-500 border-transparent bg-blue-50/30 shadow-sm"
                                )}
                              >
                                <div className="flex items-center gap-4">
                                  <span className="text-[11px] font-black text-indigo-400/80 font-mono w-4">{idx + 1}</span>
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="text-xs font-black text-slate-800 mr-0.5">{typeInfo?.label || 'Sprint'}</span>
                                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">
                                        {session.difficulty_level === 0 ? 'Basic' : `Lvl.${session.difficulty_level}`}
                                      </span>

                                      {isSpeedMode && (
                                        <span className={cn(
                                          "text-[9px] font-black px-1.5 py-0.5 rounded-md border tracking-wider",
                                          session.answer_type === '1'
                                            ? "bg-amber-50 border-amber-100 text-amber-600"
                                            : "bg-emerald-50 border-emerald-100 text-emerald-600"
                                        )}>
                                          {session.answer_type === '1' ? 'NO' : 'YES'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                                      <span className="flex items-center gap-1"><Timer size={11} /> {session.time_limit_sec}秒</span>
                                      <span className="flex items-center gap-1"><Zap size={11} fill="currentColor" className="text-amber-400" /> {session.total_answered} {session.total_answered === 1 ? 'Answer' : 'Answers'}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-200 bg-slate-50 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                  <ArrowRight size={14} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* ────────────── フッター ────────────── */}
        <div className="shrink-0 p-5 bg-white border-t border-slate-100 flex flex-col items-center">
          <button
            onClick={() => router.push('/training/sprint/play?mode=sprint')}
            className="w-full max-w-sm h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-wider shadow-lg shadow-indigo-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 border-none"
          >
            <span>スプリントを開始する</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </div>
  );
};