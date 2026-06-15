'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Zap, ArrowRight, History, Timer } from 'lucide-react';
import { cn } from "@/lib/utils";
import { SPRINT_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';

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
  targetMonth: string;
}

export const SprintHistoryView: React.FC<SprintHistoryViewProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  // 🎯 初期レンダリング時に URL パラメータから展開すべき日付を特定する
  const [expandedDates, setExpandedDates] = useState<string[]>(() => {
    if (!focusId || !initialData.length) return [];
    const targetSession = initialData.find(s => s.self_sprint_id === focusId);
    if (targetSession) {
      return [
        new Date(targetSession.insert_date).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
      ];
    }
    return [];
  });

  // 🎯 スクロール処理のみを Effect で行う（setStateは含まない）
  useEffect(() => {
    if (!focusId || initialData.length === 0) return;

    const timer = setTimeout(() => {
      const element = document.getElementById(`session-${focusId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    }, 50); // レンダリング確定後、瞬時にジャンプさせる

    return () => clearTimeout(timer);
  }, [focusId, initialData.length]);

  // 日付ごとにグループ化
  const groupedData = useMemo(() => {
    const groups: Record<string, HistorySession[]> = {};
    
    initialData.forEach(session => {
      const date = new Date(session.insert_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });

    // 各日のセッションを「実施順（昇順）」にソート
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => new Date(a.insert_date).getTime() - new Date(b.insert_date).getTime());
    });

    return groups;
  }, [initialData]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const handleMonthChange = (offset: number) => {
    const [year, month] = targetMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    router.push(`/training/sprint/history?month=${nextMonth}`);
  };

  const [displayYear, displayMonth] = targetMonth.split('-');
  const sortedDates = Object.keys(groupedData);

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-blue-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-100 rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        
        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-blue-600 p-5 sm:p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <History size={120} strokeWidth={1} />
          </div>
          
          <div className="relative space-y-5">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => router.push('/training/performance')}
                className="h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/10"
              >
                <ChevronLeft size={12} strokeWidth={3} />
                <span>Prev</span>
              </button>
              <div className="text-right">
                <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em]">Learning History</span>
                <p className="text-[9px] font-bold text-blue-100 opacity-80">学習履歴</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button onClick={() => handleMonthChange(-1)} className="p-2 text-white/60 hover:text-white transition-colors">
                <ChevronLeft size={24} strokeWidth={3} />
              </button>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-none">
                {displayYear}年 {parseInt(displayMonth)}月
              </h1>
              <button onClick={() => handleMonthChange(1)} className="p-2 text-white/60 hover:text-white transition-colors">
                <ChevronRight size={24} strokeWidth={3} />
              </button>
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
              
              // 当月の通算実施日数インデックス（新しい日付が上のため、全数から引いて算出）
              const dayNo = sortedDates.length - index;

              // その日の総回答数を計算
              const totalAnswersDay = sessions.reduce((acc, s) => acc + s.total_answered, 0);

              return (
                <div key={date} className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                  {/* 1段目: 親アコーディオンヘッダー */}
                  <button 
                    onClick={() => toggleDate(date)}
                    className="w-full p-5 sm:p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 text-left">
                      {/* 💡 改善点1: 日付の左側に当月Noを表示 */}
                      <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 font-black text-base font-mono shrink-0 select-none">
                        {dayNo}
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-800 tracking-tight">{date}</div>
                        {/* 💡 改善点2: 日付下に Sprints と Answers を並列表示。単数・複数形にも完全対応 */}
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

                  {/* 2段目: 詳細リスト (アコーディオン) */}
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
                            const typeInfo = SPRINT_TYPES[session.question_type as keyof typeof SPRINT_TYPES];
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
                                  <span className="text-xs font-black text-slate-300 font-mono w-4">{idx + 1}</span>
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="text-xs font-black text-slate-800 mr-0.5">{typeInfo?.label || 'Sprint'}</span>
                                      
                                      {/* ① レベル表示 */}
                                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">
                                        {session.difficulty_level === 0 ? 'Basic' : `Lvl.${session.difficulty_level}`}
                                      </span>

                                      {/* 💡 改善点3: YES/NOバッジはUXルールに基づきレベルの「右側」へ配置 */}
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
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100 flex items-center justify-center">
          <button
            onClick={() => router.push('/training/sprint/play?mode=sprint')}
            className="w-full max-w-sm h-12 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>Next Sprint</span>
            <ArrowRight size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};