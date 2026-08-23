'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, BarChart3, BookOpen, Zap, ArrowRight, CalendarDays, ArrowLeft, HelpCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { UserTrainingPerformanceResponse } from '@/actions/performanceAction';
import { cn } from '@/lib/utils';

interface TrainingPerformanceProps {
  initialData: UserTrainingPerformanceResponse;
  targetMonth: string; // 形式: "YYYY-MM"
}

export const TrainingPerformance: React.FC<TrainingPerformanceProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const [showTooltip, setShowTooltip] = useState(false);
  const [showSprintTooltip, setShowSprintTooltip] = useState(false);
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  // 🛠️ 月ナビゲーション（前月/翌月の年またぎ計算・当月判定・ペンディング状態）は
  // 単語履歴・スプリント履歴画面と共通のためフック化
  const { currentMonthStr, displayYear, displayMonth, isNotCurrentMonth, handleMonthChange, goToMonth, isPending } = useMonthNavigator({
    targetMonth,
    basePath: '/training/performance',
  });

  // 1. 統計データの算出
  const stats = useMemo(() => {
    const uniqueDays = new Set<string>();
    let totalWords = 0;
    let totalPhrases = 0;
    let sprintSessions = 0;
    let sprintAnswers = 0;
    let totalAssessments = 0;

    // 単語ドリル履歴の集計
    (initialData?.words || []).forEach(item => {
      const dateStr = toIsoDateInZone(item.training_date, timezone);
      uniqueDays.add(dateStr);
      totalWords += item.word_count;
      totalPhrases += item.phrase_count;
      totalAssessments += item.assessment_count;
    });

    // スプリントセッション履歴の集計
    (initialData?.sprint_sessions || []).forEach(item => {
      if (item.insert_date) {
        const dateStr = toIsoDateInZone(item.insert_date, timezone);
        uniqueDays.add(dateStr);
      }
      sprintSessions += 1;
      sprintAnswers += item.total_answered;
      totalAssessments += item.assessment_count || 0;
    });

    // スプリントドリルサマリー履歴の集計
    (initialData?.sprint_drills || []).forEach(item => {
      const dateStr = toIsoDateInZone(item.training_date, timezone);
      uniqueDays.add(dateStr);
      totalAssessments += item.assessment_count;
    });

    return {
      activeDays: uniqueDays.size,
      totalWords,
      totalPhrases,
      sprintSessions,
      sprintAnswers,
      totalAssessments
    };
  }, [initialData, timezone]);

  // 2. カレンダーデータの生成
  const calendarDays = useMemo(() => {
    const [year, month] = targetMonth.split('-').map(Number);
    const days = [];

    const historySet = new Set<string>();
    
    (initialData?.words || []).forEach(item => {
      historySet.add(toIsoDateInZone(item.training_date, timezone));
    });
    (initialData?.sprint_sessions || []).forEach(item => {
      if (item.insert_date) {
        historySet.add(toIsoDateInZone(item.insert_date, timezone));
      }
    });
    (initialData?.sprint_drills || []).forEach(item => {
      historySet.add(toIsoDateInZone(item.training_date, timezone));
    });
    
    const daysInMonth = new Date(year, month, 0).getDate();
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasHistory = historySet.has(dateStr);

      days.push({
        dayNum: d,
        hasHistory
      });
    }
    return days;
  }, [initialData, targetMonth, timezone]);

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-4">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <BarChart3 size={115} strokeWidth={1.2} className="text-indigo-600" />
          </div>

          <div className="relative flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/70 hover:text-indigo-600 active:scale-95 transition-all"
              title="ダッシュボードに戻る"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            
            <div className="text-right">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] font-mono block">
                Training Performance
              </span>
              <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                月間トレーニング成果の統合ダッシュボード
              </p>
            </div>
          </div>

          <div className="relative flex items-center justify-center pt-1">
            <div className="inline-flex items-center bg-white border border-slate-200/80 shadow-sm rounded-2xl p-1 relative">
              <button
                onClick={() => handleMonthChange('prev')}
                disabled={isPending}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all active:scale-90 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                title="前月"
              >
                <ArrowLeft size={14} strokeWidth={2.5} />
              </button>

              <div className="px-5 h-9 flex flex-col items-center justify-center min-w-[120px] select-none border-x border-slate-100">
                {isPending ? (
                  <Loader2 size={16} className="text-indigo-400 animate-spin" />
                ) : (
                  <>
                    <span className="text-[9px] font-mono font-bold text-slate-400 tracking-wider block leading-none mb-0.5">
                      {displayYear}
                    </span>
                    <span className="text-sm font-black text-slate-800 font-mono tracking-tight">
                      {parseInt(displayMonth)}月
                    </span>
                  </>
                )}
              </div>

              <button
                onClick={() => handleMonthChange('next')}
                disabled={isPending}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all active:scale-90 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                title="来月"
              >
                <ArrowRight size={14} strokeWidth={2.5} />
              </button>

              <AnimatePresence>
                {isNotCurrentMonth && (
                  <motion.button
                    initial={{ opacity: 0, x: -6, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => goToMonth(currentMonthStr)}
                    disabled={isPending}
                    className="absolute left-full ml-3 px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-white border border-indigo-100 rounded-lg hover:bg-indigo-50/80 hover:border-indigo-200 transition-all active:scale-95 shadow-xs font-sans cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none"
                    title="現在の月に戻る"
                  >
                    今月
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ────────────── メイン ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 p-4 sm:p-8 space-y-5">
          <div className="max-w-xl mx-auto space-y-5">

            {/* ────────────── コアKPI ツインヒーローエリア（プレミアム仕様） ────────────── */}
            <div className="grid grid-cols-2 gap-3.5">
              
              {/* 1. トレーニング日数カード */}
              <div 
                className="p-4 bg-gradient-to-br from-white to-indigo-50/20 border border-slate-200/70 rounded-2xl shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[110px] sm:min-h-[120px]"
              >
                <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-indigo-600" />
                
                {/* 上段 */}
                <div className="flex items-center gap-2 pl-0.5">
                  <div className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center border border-indigo-100/40 shrink-0">
                    <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] font-mono font-bold uppercase text-indigo-500/80 tracking-wider block leading-none mb-0.5">Engagement</span>
                    <p className="text-[11px] sm:text-xs font-black text-slate-800 leading-none">トレーニング日数</p>
                  </div>
                </div>

                {/* 下段：数値＆単位＋装飾オーナメント */}
                <div className="pt-2 border-t border-slate-100/60 flex items-end justify-between">
                  <span className="text-[9px] text-slate-400 font-medium pb-0.5 hidden sm:inline">Monthly Active Days</span>
                  <div className="flex items-baseline justify-end font-mono w-full sm:w-auto">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                      {stats.activeDays}
                    </span>
                    <span className="text-[10px] font-sans font-bold text-slate-400 ml-0.5">日</span>
                  </div>
                </div>
              </div>

              {/* 2. 総発話回数カード */}
              <div 
                className="p-4 bg-gradient-to-br from-white to-rose-50/15 border border-slate-200/70 rounded-2xl shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[110px] sm:min-h-[120px]"
              >
                <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-rose-500" />
                
                {/* 上段 */}
                <div className="flex items-center gap-2 pl-0.5">
                  <div className="w-7 h-7 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center border border-rose-100/40 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 sm:w-4 sm:h-4"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  </div>
                  <div>
                    <span className="text-[8px] font-mono font-bold uppercase text-rose-500/80 tracking-wider block leading-none mb-0.5">Output Intensity</span>
                    <p className="text-[11px] sm:text-xs font-black text-slate-800 leading-none">総発話回数</p>
                  </div>
                </div>

                {/* 下段：数値＆単位＋装飾オーナメント */}
                <div className="pt-2 border-t border-slate-100/60 flex items-end justify-between">
                  <span className="text-[9px] text-slate-400 font-medium pb-0.5 hidden sm:inline">Monthly Speech Log</span>
                  <div className="flex items-baseline justify-end font-mono w-full sm:w-auto">
                    <span className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight leading-none">
                      {stats.totalAssessments}
                    </span>
                    <span className="text-[10px] font-sans font-bold text-slate-400 ml-0.5">回</span>
                  </div>
                </div>
              </div>

            </div>

            {/* TRAINING DETAILSセクション */}
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest block px-1">
                Training Details
              </span>
              
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {/* 1. 単語帳 */}
                <div className="p-3 sm:p-3.5 bg-white border border-slate-200/60 rounded-2xl shadow-xs flex flex-col justify-between relative group">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-indigo-50/60 text-indigo-600 rounded-md flex items-center justify-center border border-indigo-100/20">
                      <BookOpen strokeWidth={2.5} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <span className="text-[11px] sm:text-xs font-black text-slate-700">単語帳ドリル</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-1">
                    <div>
                      <span className="text-[9px] font-medium text-slate-400 block">単語</span>
                      <span className="text-sm sm:text-base font-mono font-black text-slate-900 tracking-tight">{stats.totalWords}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-medium text-slate-400 block">フレーズ</span>
                      <span className="text-sm sm:text-base font-mono font-black text-slate-900 tracking-tight">{stats.totalPhrases}</span>
                    </div>
                  </div>
                </div>

                {/* 2. スプリント */}
                <div className="p-3 sm:p-3.5 bg-white border border-slate-200/60 rounded-2xl shadow-xs flex flex-col justify-between relative group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-amber-50/60 text-amber-500 rounded-md flex items-center justify-center border border-amber-100/20">
                        <Zap strokeWidth={2.5} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <span className="text-[11px] sm:text-xs font-black text-slate-700">スプリント</span>
                    </div>
                    <div className="relative flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowSprintTooltip(!showSprintTooltip)}
                        onMouseEnter={() => setShowSprintTooltip(true)}
                        onMouseLeave={() => setShowSprintTooltip(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-help transition-colors focus:outline-none flex items-center justify-center"
                      >
                        <HelpCircle size={12} />
                      </button>
                      <AnimatePresence>
                        {showSprintTooltip && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            className="absolute bottom-full mb-2 right-0 bg-slate-800 text-white text-[10px] py-1.5 px-2.5 rounded-lg shadow-md whitespace-nowrap z-50 pointer-events-none"
                          >
                            ドリルモードの回答数は含まれていません
                            <div className="absolute top-full right-[4px] border-4 border-transparent border-t-slate-800" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-1">
                    <div>
                      <span className="text-[9px] font-medium text-slate-400 block">本数</span>
                      <span className="text-sm sm:text-base font-mono font-black text-slate-900 tracking-tight">{stats.sprintSessions}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-medium text-slate-400 block">回答数</span>
                      <span className="text-sm sm:text-base font-mono font-black text-slate-900 tracking-tight">{stats.sprintAnswers}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* カレンダー：トレーニング・トラッカー */}
              <div className="p-4 sm:p-5 bg-white border border-slate-200/60 rounded-2xl shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">
                      トレーニング・トラッカー
                    </h3>
                    <div className="relative flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowTooltip(!showTooltip)}
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-help transition-colors focus:outline-none flex items-center"
                      >
                        <HelpCircle size={13} />
                      </button>
                      <AnimatePresence>
                        {showTooltip && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1.5 px-2.5 rounded-lg shadow-md whitespace-nowrap z-50 pointer-events-none"
                          >
                            トレーニングした日付がマークされます
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-slate-400">
                    {parseInt(displayMonth)}月の実施状況
                  </span>
                </div>
                
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
                  {calendarDays.map((day, idx) => (
                    <div key={idx} className="flex flex-col items-center justify-center">
                      <div className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[11px] sm:text-xs font-mono font-bold flex items-center justify-center transition-all",
                        day.hasHistory
                          ? "bg-indigo-600 text-white font-black shadow-xs ring-4 ring-indigo-50"
                          : "bg-slate-50 text-slate-400"
                      )}>
                        {day.dayNum}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* LOGS MENUセクション */}
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest block px-1">
                Logs Menu
              </span>

              {/* 1. 単語ドリル履歴 */}
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
                      <h2 className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                        単語帳ドリルのトレーニング履歴
                      </h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400 mt-1 leading-normal">
                      日ごとの成果や、取り組んだ教材ごとの内訳を振り返ります。
                    </p>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all shrink-0">
                  <ArrowRight size={12} strokeWidth={2.5} />
                </div>
              </button>

              {/* 2. スプリント履歴 */}
              <button
                onClick={() => router.push('/training/sprint/history')}
                className="w-full text-left p-4 bg-white border border-slate-200/80 rounded-xl shadow-xs flex items-center justify-between hover:border-amber-200 hover:bg-slate-50/20 transition-all group active:scale-[0.995] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0 border border-amber-100/40">
                    <Zap size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-black text-slate-800 group-hover:text-amber-600 transition-colors">
                        スプリントのトレーニング履歴
                      </h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400 mt-1 leading-normal">
                      自らの発話・瞬発力を鍛えたログを一覧でチェックします。
                    </p>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-600 transition-all shrink-0">
                  <ArrowRight size={12} strokeWidth={2.5} />
                </div>
              </button>
            </div>

          </div>
        </div>

        {/* ────────────── フッター ────────────── */}
        <div className="shrink-0 p-5 sm:p-6 bg-white border-t border-slate-100">
          <button
            onClick={() => router.push('/library')}
            className="w-full h-13 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 border-none"
          >
            <span>教材を選択する</span>
            <ArrowRight size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};