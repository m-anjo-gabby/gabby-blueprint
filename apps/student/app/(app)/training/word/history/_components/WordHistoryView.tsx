// apps/student/app/(app)/training/review/_components/WordHistoryView.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, BookOpen, MessageSquareText, ShieldCheck } from 'lucide-react';
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
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200 rounded-[32px] shadow-xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー：Performance画面と完璧に調和するプレミアム・インディゴ ────────────── */}
        <div className="shrink-0 bg-linear-to-br from-indigo-900 via-slate-900 to-indigo-950 p-5 sm:p-6 text-white relative overflow-hidden border-b border-indigo-950">
          {/* 背景の光のグラデーション表現を同期 */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <BookOpen size={120} strokeWidth={1} className="text-white" />
          </div>

          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              {/* 💡 ギャップ修正：パフォーマンス画面への戻りボタン。デザインと言葉（PERFORMANCE）を美しく最適化 */}
              <button
                onClick={() => router.push('/training/performance')}
                className="h-8 px-3 flex items-center justify-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.97] text-indigo-200 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider backdrop-blur-xs border border-white/5"
              >
                <ChevronLeft size={12} strokeWidth={3} />
                <span>PERFORMANCE</span>
              </button>
              
              <div className="text-right">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] font-mono block">
                  Word Drill History
                </span>
                <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                  単語ドリル履歴の詳細ログ
                </p>
              </div>
            </div>

            {/* 月移動：文字のウェイト、コントラスト、サイズ感をPerformance画面と100%統一 */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button 
                onClick={() => handleMonthChange(-1)} 
                className="p-2 text-indigo-300/70 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-95"
                title="前月"
              >
                <ChevronLeft size={22} strokeWidth={3} />
              </button>
              
              <h1 className="text-xl font-black tracking-tight leading-none text-white drop-shadow-xs">
                {displayYear}年 {parseInt(displayMonth)}月
              </h1>

              <button 
                onClick={() => handleMonthChange(1)} 
                className="p-2 text-indigo-300/70 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-95"
                title="来月"
              >
                <ChevronRight size={22} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：リストエリア ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 sm:p-6">
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
                <div key={date} className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden shadow-xs">
                  {/* 親アコーディオンヘッダー */}
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/40 transition-colors"
                  >
                    <div className="flex items-center gap-4 text-left">
                      {/* インディゴ調の落ち着いたナンバリングバッジ */}
                      <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-black text-sm font-mono shrink-0 select-none">
                        {sortedDates.length - index}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 tracking-tight">{date}</div>
                        <div className="flex items-center gap-1.5 mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                          <span>{totalWordsDay} 単語</span>
                          <span className="w-0.5 h-0.5 bg-slate-300 rounded-full" />
                          <span>{totalPhrasesDay} フレーズ</span>
                          <span className="w-0.5 h-0.5 bg-slate-300 rounded-full" />
                          <span className="text-emerald-600 font-bold">{totalAssessmentsDay} 発話評価</span>
                        </div>
                      </div>
                    </div>
                    <div className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </button>

                  {/* 詳細リスト (アコーディオン) */}
                  <AnimatePresence>
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
                                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                      <span className="text-xs font-bold text-slate-800">{session.com_m_contents.content_name || 'Unknown Content'}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-[9px] font-bold text-slate-400">
                                      <span className="flex items-center gap-0.5"><BookOpen size={10} /> {session.word_count}w</span>
                                      <span className="flex items-center gap-0.5"><MessageSquareText size={10} /> {session.phrase_count}p</span>
                                      <span className="flex items-center gap-0.5 text-emerald-500"><ShieldCheck size={10} /> {session.assessment_count}f</span>
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

        {/* ────────────── フッター：PerformanceのLibraryボタンとデザインルールを統一 ────────────── */}
        <div className="shrink-0 p-4 sm:p-5 bg-white border-t border-slate-200 flex flex-col items-center">
          <button
            onClick={() => router.push('/library')}
            className="w-full max-w-sm h-11 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-slate-800 transition-all active:scale-98 flex items-center justify-center gap-2"
          >
            <span>Library（教材一覧）を開く</span>
            <BookOpen size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};