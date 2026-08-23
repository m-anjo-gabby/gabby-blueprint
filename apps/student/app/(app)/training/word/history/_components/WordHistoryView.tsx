'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Calendar, BookOpen, MessageSquareText, ArrowLeft, ArrowRight, ChevronDown, Library, Mic, Loader2, Home } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { motion, AnimatePresence } from 'framer-motion';
import { WordSummaryHistoryItem } from '@/actions/wordAction';

interface WordHistoryViewProps {
  initialData: WordSummaryHistoryItem[];
  targetMonth: string; // 形式: "YYYY-MM"
}

interface GroupedWordHistory {
  [date: string]: WordSummaryHistoryItem[];
}

export const WordHistoryView: React.FC<WordHistoryViewProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  // 🛠️ 月ナビゲーション（前月/翌月の年またぎ計算等）はSprint履歴画面と共通のためフック化
  const { currentMonthStr, displayYear, displayMonth, isNotCurrentMonth, handleMonthChange, goToMonth, isPending } = useMonthNavigator({
    targetMonth,
    basePath: '/training/word/history',
    navigate: 'replace',
  });

  // 📊 ヘッダーの月次サマリー用集計（追加のAPIコールなしで算出）
  const monthlyTotals = useMemo(() => {
    return initialData.reduce(
      (acc, s) => {
        acc.words += s.word_count;
        acc.phrases += s.phrase_count;
        return acc;
      },
      { words: 0, phrases: 0 }
    );
  }, [initialData]);

  // 🎯 日付ごとにグループ化（React Compiler が確実に追随できるよう外部関数参照を排除し、依存配列を修正）
  const groupedData = useMemo(() => {
    const groups: GroupedWordHistory = {};

    initialData.forEach(session => {
      // 💡 外部関数を通さず、直接インラインでタイムゾーン付きフォーマットを実行
      const dateStr = formatZonedDate(session.training_date, timezone);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(session);
    });

    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => {
        const nameA = a.com_m_contents?.content_name || '';
        const nameB = b.com_m_contents?.content_name || '';
        return nameA.localeCompare(nameB);
      });
    });

    return groups;
  }, [initialData, timezone]); // 💡 静的解析が一致するよう `timezone` を依存配列にしっかり追加

  const toggleDate = (date: string) => {
    setExpandedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  // ソートの計算量最適化
  const sortedDates = useMemo(() => {
    return Object.keys(groupedData).sort((a, b) => b.localeCompare(a));
  }, [groupedData]);

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-3">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <BookOpen size={115} strokeWidth={1.2} className="text-indigo-600" />
          </div>

          {/* Row1: 戻る（左端）+ 画面名（右端） */}
          <div className="relative flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/training/performance')}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/70 hover:text-indigo-600 active:scale-95 transition-all"
                title="パフォーマンスに戻る"
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
                Word Drill History
              </span>
              <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                単語ドリルの学習履歴
              </p>
            </div>
          </div>

          {/* Row2: 月移動 */}
          <div className="relative flex items-center justify-center z-10">
            <div className="inline-flex items-center bg-white border border-slate-200/80 shadow-sm rounded-xl p-0.5 relative">
              <button
                onClick={() => handleMonthChange('prev')}
                disabled={isPending}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all active:scale-90 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                title="前月"
              >
                <ArrowLeft size={13} strokeWidth={2.5} />
              </button>

              <div className="px-3 h-8 flex items-center justify-center min-w-24 select-none border-x border-slate-100">
                {isPending ? (
                  <Loader2 size={16} className="text-indigo-400 animate-spin" />
                ) : (
                  <span className="text-sm font-black text-slate-800 font-mono tracking-tight whitespace-nowrap">
                    <span className="text-slate-400 font-bold mr-1.5">{displayYear}年</span>
                    {parseInt(displayMonth)}月
                  </span>
                )}
              </div>

              <button
                onClick={() => handleMonthChange('next')}
                disabled={isPending}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all active:scale-90 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                title="来月"
              >
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>

              {/* 「今月」ボタン */}
              <AnimatePresence>
                {isNotCurrentMonth && (
                  <motion.button
                    initial={{ opacity: 0, x: -6, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => goToMonth(currentMonthStr)}
                    disabled={isPending}
                    className="absolute left-full ml-3 px-2.5 py-1 text-xs font-bold text-indigo-600 bg-white border border-indigo-100 rounded-lg hover:bg-indigo-50/80 hover:border-indigo-200 transition-all active:scale-95 shadow-xs font-sans cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none"
                    title="現在の月に戻る"
                  >
                    今月
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Row3: 月次サマリー */}
          <div className="relative z-10 flex justify-center select-none">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-slate-700 font-sans">
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <Calendar size={13} strokeWidth={2.5} className="text-slate-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">実施日数</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{sortedDates.length}</span>
              </div>
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <BookOpen size={13} strokeWidth={2.5} className="text-blue-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">単語</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{monthlyTotals.words}</span>
              </div>
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <MessageSquareText size={13} strokeWidth={2.5} className="text-emerald-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">フレーズ</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{monthlyTotals.phrases}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：リストエリア ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 p-5 sm:p-6">
          <div className="max-w-xl mx-auto space-y-3">
          {sortedDates.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200 mt-4">
              <Calendar size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-xs font-bold text-slate-400">この月の単語ドリル履歴はありません</p>
            </div>
          ) : (
            sortedDates.map((date) => {
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
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/40 transition-colors"
                  >
                    <div className="text-left">
                      <div className="text-sm font-bold text-slate-800 tracking-tight mb-1.5">{date}</div>

                      <div className="flex items-center gap-3 text-xs font-bold text-slate-600 flex-wrap">
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
                          <Mic size={12} className="text-rose-500 shrink-0" />
                          <span>発話評価</span>
                          <span className="font-mono text-slate-800 font-black">{totalAssessmentsDay}</span>
                        </span>
                      </div>
                    </div>
                    <div className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                      <ChevronDown size={16} className="text-slate-400" />
                    </div>
                  </button>

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
                          {sessions.map((session) => (
                            <div
                              key={session.content_id}
                              className="flex items-center justify-between p-3.5 bg-white border border-slate-200/60 rounded-xl hover:border-indigo-200 transition-all group"
                            >
                              <div>
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800">{session.com_m_contents?.content_name || 'Unknown Content'}</span>
                                </div>

                                <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <BookOpen size={12} className="text-blue-500/80" />
                                    <span className="font-mono text-slate-700 font-extrabold">{session.word_count}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MessageSquareText size={12} className="text-emerald-500/80" />
                                    <span className="font-mono text-slate-700 font-extrabold">{session.phrase_count}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Mic size={12} className="text-rose-500" />
                                    <span className="font-mono text-slate-700 font-extrabold">{session.assessment_count}</span>
                                  </span>
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

        {/* ────────────── フッター ────────────── */}
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100">
          <button
            onClick={() => router.push('/library')}
            className="w-full h-13 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 border-none"
          >
            <span>教材を選択する</span>
            <Library size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};