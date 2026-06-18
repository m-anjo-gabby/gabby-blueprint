'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Calendar, BookOpen, MessageSquareText, ShieldCheck, ArrowLeft, ArrowRight, ChevronDown, Library } from 'lucide-react';
import { cn } from "@/lib/utils";
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

  // 当月の文字列（"YYYY-MM"）を生成
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // 日付文字列を「表示形式（YYYY/MM/DD）」に高速・確実に標準化する関数（データ量増加ケア）
  const formatDateKey = (dateInput: string | Date): string => {
    const d = new Date(dateInput);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  // 日付ごとにグループ化（データ集計ロジックを最適化＆安全化）
  const groupedData = useMemo(() => {
    const groups: GroupedWordHistory = {};

    initialData.forEach(session => {
      const dateStr = formatDateKey(session.training_date);
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
  }, [initialData]);

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
    router.replace(`/training/word/history?month=${targetMonthStr}`, { scroll: false });
  };

  const [displayYear, displayMonth] = targetMonth.split('-');
  const isNotCurrentMonth = targetMonth !== currentMonthStr;
  
  // ソートの計算量最適化：Dateオブジェクトを都度生成せず、文字列比較（YYYY/MM/DDの降順）で高速に処理
  const sortedDates = useMemo(() => {
    return Object.keys(groupedData).sort((a, b) => b.localeCompare(a));
  }, [groupedData]);

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
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100/80 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
              title="パフォーマンスに戻る"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
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

          {/* 月移動：カプセル型UI ＆ 「今月」ボタン配置エリア */}
          <div className="relative flex items-center justify-center pt-1">
            
            {/* カプセルを包含するインラインコンテナ */}
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

              {/* カプセルの右端から ml-3 離した被らない位置に「今月」ボタンを絶対配置 */}
              <AnimatePresence>
                {isNotCurrentMonth && (
                  <motion.button
                    initial={{ opacity: 0, x: -6, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => router.replace(`/training/word/history?month=${currentMonthStr}`, { scroll: false })}
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
                                    <span className="text-xs font-bold text-slate-800">{session.com_m_contents?.content_name || 'Unknown Content'}</span>
                                  </div>
                                  
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