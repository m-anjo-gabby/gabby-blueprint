'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, BookOpen, MessageSquareText, ShieldCheck } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from 'framer-motion';
import { WordSummaryHistoryItem } from '@/actions/wordAction'; // Import the new type

interface WordHistoryViewProps {
  initialData: WordSummaryHistoryItem[];
  targetMonth: string;
}

// Grouped data structure
interface GroupedWordHistory {
  [date: string]: WordSummaryHistoryItem[];
}

export const WordHistoryView: React.FC<WordHistoryViewProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // No 'focusId' for word history as there's no result screen to link to.
  // 💡 改善点: page.tsx側の key={targetMonth} のおかげで、月変更時はここが自動的に [] でクリーンに初期化されます。
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // 日付ごとにグループ化
  const groupedData = useMemo(() => {
    const groups: GroupedWordHistory = {};

    initialData.forEach(session => {
      // Ensure training_date is treated as a local date for grouping
      const date = new Date(session.training_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(session);
    });

    // 各日のセッションを「コンテンツ名順」にソート
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

  // パターン2: router.replace を使用して履歴スタックを増やさないスムーズな移行
  const handleMonthChange = (offset: number) => {
    const [year, month] = targetMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // replace によりブラウザの戻るスタックを汚さず、scroll: false でガタつきを無くします
    router.replace(`/training/word/history?month=${nextMonth}`, { scroll: false });
  };

  const [displayYear, displayMonth] = useMemo(() => {
    return targetMonth.split('-');
  }, [targetMonth]);
  const sortedDates = Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); // Sort dates descending

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-blue-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-100 rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-indigo-600 p-5 sm:p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <BookOpen size={120} strokeWidth={1} />
          </div>

          <div className="relative space-y-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/training')}
                className="h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/10"
              >
                <ChevronLeft size={12} strokeWidth={3} />
                <span>トレーニングログへ</span>
              </button>
              <div className="text-right">
                <span className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.2em]">Word Drill History</span>
                <p className="text-[9px] font-bold text-indigo-100 opacity-80">単語ドリル履歴</p>
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
              <p className="text-sm font-bold text-slate-400">この月の単語ドリル履歴はありません</p>
            </div>
          ) : (
            sortedDates.map((date, index) => {
              const sessions = groupedData[date];
              const isExpanded = expandedDates.includes(date);

              // その日の総回答数を計算
              const totalWordsDay = sessions.reduce((acc, s) => acc + s.word_count, 0);
              const totalPhrasesDay = sessions.reduce((acc, s) => acc + s.phrase_count, 0);
              const totalAssessmentsDay = sessions.reduce((acc, s) => acc + s.assessment_count, 0);

              return (
                <div key={date} className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                  {/* 1段目: 親アコーディオンヘッダー */}
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full p-5 sm:p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 text-left">
                      {/* 日付の左側に当月Noを表示 */}
                      <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 font-black text-base font-mono shrink-0 select-none">
                        {sortedDates.length - index}
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-800 tracking-tight">{date}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                          <span>
                            {totalWordsDay} 単語
                          </span>
                          <span className="w-1 h-1 bg-slate-300 rounded-full" />
                          <span>
                            {totalPhrasesDay} フレーズ
                          </span>
                          <span className="w-1 h-1 bg-slate-300 rounded-full" />
                          <span className="text-emerald-500 flex items-center gap-0.5">
                            {totalAssessmentsDay} 発話評価
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
                          {sessions.map((session, idx) => (
                              <div
                                key={session.content_id}
                                className={cn(
                                  "flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:shadow-md transition-all group cursor-pointer"
                                )}
                              >
                                <div className="flex items-center gap-4">
                                  <span className="text-xs font-black text-slate-300 font-mono w-4">{idx + 1}</span>
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="text-xs font-black text-slate-800 mr-0.5">{session.com_m_contents.content_name || 'Unknown Content'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                                      <span className="flex items-center gap-1"><BookOpen size={11} /> {session.word_count} 単語</span>
                                      <span className="flex items-center gap-1"><MessageSquareText size={11} /> {session.phrase_count} フレーズ</span>
                                      <span className="flex items-center gap-1 text-emerald-500"><ShieldCheck size={11} /> {session.assessment_count} 発話評価</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
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
            onClick={() => router.push('/library')}
            className="w-full max-w-sm h-12 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>教材を選択してトレーニング</span>
            <BookOpen size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};