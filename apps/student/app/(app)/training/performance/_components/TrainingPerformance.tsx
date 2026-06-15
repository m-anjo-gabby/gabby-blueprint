// apps/student/app/(app)/training/review/_components/TrainingPerformance.tsx
'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, BarChart3, BookOpen, Zap, ArrowRight, Library, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import { WordSummaryHistoryItem } from '@/actions/wordAction';

interface TrainingPerformanceProps {
  initialData: WordSummaryHistoryItem[];
  targetMonth: string;
}

export const TrainingPerformance: React.FC<TrainingPerformanceProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();

  const stats = useMemo(() => {
    const uniqueDays = new Set<string>();
    let totalWords = 0;
    let totalPhrases = 0;
    let totalAssessments = 0;

    initialData.forEach(item => {
      const dateStr = new Date(item.training_date).toDateString();
      uniqueDays.add(dateStr);
      totalWords += item.word_count;
      totalPhrases += Math.floor(item.word_count * 0.4);
      totalAssessments += item.assessment_count;
    });

    return {
      activeDays: uniqueDays.size,
      totalWords: totalWords,
      totalPhrases: totalPhrases,
      totalAssessments: totalAssessments
    };
  }, [initialData]);

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
    router.push(`/training/performance?month=${targetMonthStr}`);
  };

  const calendarDays = useMemo(() => {
    const [year, month] = targetMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const days = [];
    
    while (date.getMonth() === month - 1) {
      const dateStr = date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hasHistory = initialData.some(item => 
        new Date(item.training_date).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }) === dateStr
      );

      days.push({
        dayNum: date.getDate(),
        hasHistory
      });
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [initialData, targetMonth]);

  const [displayYear, displayMonth] = targetMonth.split('-');

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー：他画面と調和する洗練された白・薄インディゴ調 ────────────── */}
        <div className="shrink-0 bg-white border-b border-slate-100 p-5 sm:p-6 relative overflow-hidden space-y-5">
          {/* 右上のアイコンも悪目立ちしない淡いグレーインディゴに調整 */}
          <div className="absolute top-0 right-0 p-4 opacity-[0.02] pointer-events-none">
            <BarChart3 size={110} strokeWidth={1.5} className="text-indigo-900" />
          </div>

          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-500 flex items-center gap-1 text-sm font-bold"
              >
                <ChevronLeft size={20} className="text-slate-700" />
                <span className="text-xs font-black text-slate-500 tracking-tight pr-1">TOP</span>
              </button>
              
              {/* ご提示いただいた美しいデザインをPerformance用に最適化 */}
              <div className="text-right">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] font-mono block">
                  Training Performance
                </span>
                <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                  月間トレーニング成果の統合ダッシュボード
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button 
                onClick={() => handleMonthChange('prev')} 
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 border border-transparent hover:border-slate-100"
                title="前月"
              >
                <ChevronLeft size={20} strokeWidth={3} />
              </button>
              
              <h1 className="text-xl font-black tracking-tight leading-none text-slate-800">
                {displayYear}年 <span className="text-indigo-600">{parseInt(displayMonth)}月</span>
              </h1>

              <button 
                onClick={() => handleMonthChange('next')} 
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 border border-transparent hover:border-slate-100"
                title="来月"
              >
                <ChevronRight size={20} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {/* ────────────── メイン：白・ライトグレーベース ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 p-5 sm:p-8 space-y-5">
          <div className="max-w-xl mx-auto space-y-5">

            {/* トレーニング日数サマリーカード */}
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 bg-white border border-slate-200/60 rounded-2xl flex items-center justify-between shadow-xs relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
              <div className="flex items-center gap-3 pl-1">
                <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center border border-indigo-100/30">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400 tracking-wider block">Monthly Engagement</span>
                  <p className="text-xs font-bold text-slate-700">トレーニング日数</p>
                </div>
              </div>
              <div className="flex items-baseline gap-0.5 font-mono">
                <span className="text-3xl font-black text-slate-900 tracking-tight">{stats.activeDays}</span>
                <span className="text-[10px] font-bold text-slate-400">/日</span>
              </div>
            </motion.div>

            {/* 統計データエリア */}
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest block px-1">
                Training Details
              </span>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400 tracking-wider block mb-2">Words</span>
                  <div className="space-y-0.5">
                    <div className="text-xl font-mono font-black text-slate-900 tracking-tight">{stats.totalWords}</div>
                    <span className="text-[10px] font-bold text-slate-500 block">単語数</span>
                  </div>
                </div>

                <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400 tracking-wider block mb-2">Phrases</span>
                  <div className="space-y-0.5">
                    <div className="text-xl font-mono font-black text-indigo-500 tracking-tight">{stats.totalPhrases}</div>
                    <span className="text-[10px] font-bold text-slate-500 block">フレーズ数</span>
                  </div>
                </div>

                <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400 tracking-wider block mb-2">Feedback</span>
                  <div className="space-y-0.5">
                    <div className="text-xl font-mono font-black text-slate-900 tracking-tight">{stats.totalAssessments}</div>
                    <span className="text-[10px] font-bold text-slate-500 block">発話評価数</span>
                  </div>
                </div>
              </div>
            </div>

            {/* カレンダー */}
            <div className="p-5 bg-white border border-slate-200/60 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">
                  トレーニング・トラッカー
                </h3>
                <span className="text-[9px] font-mono font-bold text-slate-400">
                  {parseInt(displayMonth)}月の実施状況
                </span>
              </div>
              
              <div className="grid grid-cols-7 gap-2 text-center">
                {calendarDays.map((day, idx) => (
                  <div key={idx} className="flex flex-col items-center justify-center">
                    <div className={`w-8 h-8 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all ${
                      day.hasHistory 
                        ? 'bg-indigo-500 text-white font-black shadow-sm ring-4 ring-indigo-50' 
                        : 'bg-slate-50 text-slate-400'
                    }`}>
                      {day.dayNum}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* メニュー */}
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest block px-1">
                Logs Menu
              </span>

              <button
                onClick={() => router.push('/training/word/history')}
                className="w-full text-left p-4 bg-white border border-slate-200/80 rounded-xl shadow-xs flex items-center justify-between hover:border-indigo-200 hover:bg-slate-50/20 transition-all group active:scale-[0.995] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 border border-indigo-100/40">
                    <BookOpen size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 uppercase">Word</span>
                      <h2 className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        単語ドリル履歴の詳細ログ
                      </h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                      セッション毎の日時、単語・フレーズ判定の内訳を遡ります。
                    </p>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-all shrink-0">
                  <ArrowRight size={12} strokeWidth={2.5} />
                </div>
              </button>

              <div className="w-full text-left p-4 bg-slate-50/40 border border-slate-200/40 border-dashed rounded-xl flex items-center justify-between opacity-60 select-none">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center shrink-0">
                    <Zap size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-400 uppercase">Sprint</span>
                      <h2 className="text-xs font-bold text-slate-400">スプリント履歴 (準備中)</h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                      瞬発発話データの計測ログ、評価フィードバックが自動同期されます。
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ────────────── フッター：ConfirmModal (info) スタイル ────────────── */}
        <div className="shrink-0 p-5 bg-white border-t border-slate-100 flex flex-col items-center">
          <button
            onClick={() => router.push('/library')}
            className="w-full max-w-sm h-12 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-[11px] uppercase tracking-wider shadow-lg shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>教材を選択する</span>
            <Library size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};