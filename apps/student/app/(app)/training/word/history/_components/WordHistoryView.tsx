// apps/student/app/(app)/training/review/_components/WordHistoryView.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Calendar, BookOpen, MessageSquareText, ShieldCheck, ArrowLeft, ArrowRight, ChevronDown, Library } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { WordSummaryHistoryItem } from '@/actions/wordAction';

interface WordHistoryViewProps {
  initialData: WordSummaryHistoryItem[];
  targetMonth: string;
}

interface GroupedWordHistory {
  [date: string]: WordSummaryHistoryItem[];
}

export const WordHistoryView: React.FC<WordHistoryViewProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // 日付ごとにグループ化
  const groupedData = useMemo(() => {
    const groups: GroupedWordHistory = {};

    initialData.forEach(session => {
      const date = new Date(session.training_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });

    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => a.com_m_contents.content_name.localeCompare(b.com_m_contents.content_name));
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
    router.replace(`/training/word/history?month=${nextMonth}`, { scroll: false });
  };

  const [displayYear, displayMonth] = useMemo(() => {
    return targetMonth.split('-');
  }, [targetMonth]);
  
  const sortedDates = Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー：Performance画面と100%完全同期したライトインディゴ ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-4">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <BookOpen size={115} strokeWidth={1.2} className="text-indigo-600" />
          </div>

          <div className="relative flex items-center justify-between">
            <button
              onClick={() => router.push('/training/performance')}
              className="p-2 -ml-2 hover:bg-indigo-100/50 rounded-2xl transition-all active:scale-90 text-slate-500 flex items-center gap-1 text-sm font-bold"
            >
              <ChevronLeft size={20} className="text-slate-700" />
              <span className="text-xs font-black text-slate-500 tracking-tight pr-1">PERFORMANCE</span>
            </button>
            
            <div className="text-right">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] font-mono block">
                Word Drill History
              </span>
              <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                単語ドリル履歴の詳細ログ
              </p>
            </div>
          </div>

          {/* 月移動：中央インライン集約 */}
          <div className="relative flex items-center justify-center gap-5 pt-1">
            <button 
              onClick={() => handleMonthChange(-1)} 
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-indigo-100/60 rounded-xl transition-all active:scale-90 border border-transparent flex items-center justify-center"
              title="前月"
            >
              <ArrowLeft size={16} strokeWidth={2.5} />
            </button>
            
            <h1 className="text-lg font-black tracking-tight leading-none text-slate-800 font-mono select-none min-w-[110px] text-center">
              {displayYear}年 {parseInt(displayMonth)}月
            </h1>

            <button 
              onClick={() => handleMonthChange(1)} 
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-indigo-100/60 rounded-xl transition-all active:scale-90 border border-transparent flex items-center justify-center"
              title="来月"
            >
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ────────────── メイン：リストエリア（白・ライトグレーベース） ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 p-5 sm:p-6">
          <div className="max-w-xl mx-auto space-y-3">
          {sortedDates.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200 mt-4">
              <Calendar size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-xs font-bold text-slate-400">この月の単語ドリル履歴はありません</p>
            </div>
          ) : (
            sortedDates.map((date, index) => {
              const sessions = groupedData[date];
              const isExpanded = expandedDates.includes(date);

              const totalWordsDay = sessions.reduce((acc, s) => acc + s.word_count, 0);
              const totalPhrasesDay = sessions.reduce((acc, s) => acc + s.phrase_count, 0);
              const totalAssessmentsDay = sessions.reduce((acc, s) => acc + s.assessment_count, 0);

              return (
                <motion.div 
                  key={date} 
                  layout="position"
                  className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden shadow-xs"
                >
                  {/* 親アコーディオンヘッダー */}
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/40 transition-colors"
                  >
                    <div className="flex items-center gap-4 text-left">
                      <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-black text-sm font-mono shrink-0 select-none">
                        {sortedDates.length - index}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 tracking-tight mb-1.5">{date}</div>
                        
                        {/* 💡 改善：日本語ベースの分かりやすい表記 ＆ アイコンのやさしい色分け */}
                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1">
                            <BookOpen size={12} className="text-blue-500 shrink-0" />
                            <span>単語</span>
                            <span className="font-mono text-slate-800 font-black">{totalWordsDay}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquareText size={12} className="text-emerald-500 shrink-0" />
                            <span>フレーズ</span>
                            <span className="font-mono text-slate-800 font-black">{totalPhrasesDay}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <ShieldCheck size={12} className="text-amber-500 shrink-0" />
                            <span>発話評価</span>
                            <span className="font-mono text-slate-800 font-black">{totalAssessmentsDay}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                      <ChevronDown size={16} className="text-slate-400" />
                    </div>
                  </button>

                  {/* 詳細リスト (アコーディオン) */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="border-t border-slate-100 bg-slate-50/30"
                      >
                        <div className="p-3 sm:p-4 space-y-2">
                          {sessions.map((session, idx) => (
                            <div
                              key={session.content_id}
                              className="flex items-center justify-between p-3.5 bg-white border border-slate-200/60 rounded-xl hover:border-indigo-200 transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-300 font-mono w-4 text-center">{idx + 1}</span>
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <span className="text-xs font-bold text-slate-800">{session.com_m_contents.content_name || 'Unknown Content'}</span>
                                  </div>
                                  
                                  {/* 💡 改善：子要素はラベルを廃止し「アイコン＋数字」のみで超ミニマル化 */}
                                  <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                                    <span className="flex items-center gap-1">
                                      <BookOpen size={12} className="text-blue-500/80" /> 
                                      <span className="font-mono text-slate-700 font-extrabold">{session.word_count}</span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MessageSquareText size={12} className="text-emerald-500/80" /> 
                                      <span className="font-mono text-slate-700 font-extrabold">{session.phrase_count}</span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <ShieldCheck size={12} className="text-amber-500/80" /> 
                                      <span className="font-mono text-slate-700 font-extrabold">{session.assessment_count}</span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
          </div>
        </div>

        {/* ────────────── フッター：PerformanceのLibraryボタンとデザイン・カラーを100%統一 ────────────── */}
        <div className="shrink-0 p-5 bg-white border-t border-slate-100 flex flex-col items-center">
          <button
            onClick={() => router.push('/library')}
            className="w-full max-w-sm h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-wider shadow-lg shadow-indigo-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 border-none"
          >
            <span>教材を選択する</span>
            <Library size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};