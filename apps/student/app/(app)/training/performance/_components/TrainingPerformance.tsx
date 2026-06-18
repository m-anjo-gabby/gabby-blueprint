'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, BarChart3, BookOpen, Zap, ArrowRight, Library, CalendarDays, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WordSummaryHistoryItem } from '@/actions/wordAction';

interface TrainingPerformanceProps {
  initialData: WordSummaryHistoryItem[];
  targetMonth: string; // 形式: "YYYY-MM"
}

export const TrainingPerformance: React.FC<TrainingPerformanceProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();

  // 当月の文字列（"YYYY-MM"）を生成
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // 日付文字列の標準化関数（タイムゾーン依存を排除し、パフォーマンスを担保）
  const formatDateKey = (dateInput: string | Date): string => {
    const d = new Date(dateInput);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 1. 統計データの算出（一回のループで集計し、データ量増加に対応）
  const stats = useMemo(() => {
    const uniqueDays = new Set<string>();
    let totalWords = 0;
    let totalPhrases = 0;
    let totalAssessments = 0;

    initialData.forEach(item => {
      const dateStr = formatDateKey(item.training_date);
      uniqueDays.add(dateStr);
      totalWords += item.word_count;
      totalPhrases += Math.floor(item.word_count * 0.4);
      totalAssessments += item.assessment_count;
    });

    return {
      activeDays: uniqueDays.size,
      totalWords,
      totalPhrases,
      totalAssessments
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

  // 2. カレンダーデータの生成（データ量増加に伴うケア：探索計算量を O(N) から O(1) へ最適化）
  const calendarDays = useMemo(() => {
    const [year, month] = targetMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const days = [];

    // あらかじめ履歴のある日付文字列をSet化（ハッシュマップ化により検索を高速化）
    const historySet = new Set(initialData.map(item => formatDateKey(item.training_date)));
    
    while (date.getMonth() === month - 1) {
      const dateStr = formatDateKey(date);
      const hasHistory = historySet.has(dateStr); // O(1) で瞬時に判定

      days.push({
        dayNum: date.getDate(),
        hasHistory
      });
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [initialData, targetMonth]);

  const [displayYear, displayMonth] = targetMonth.split('-');
  const isNotCurrentMonth = targetMonth !== currentMonthStr;

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">

        {/* ────────────── ヘッダー：中央集約レイアウト ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-4">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <BarChart3 size={115} strokeWidth={1.2} className="text-indigo-600" />
          </div>

          <div className="relative flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100/80 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
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

              {/* カプセルの右端（left-full）から ml-3 離した安全な位置に「今月」ボタンを絶対配置 */}
              <AnimatePresence>
                {isNotCurrentMonth && (
                  <motion.button
                    initial={{ opacity: 0, x: -6, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => router.push(`/training/performance?month=${currentMonthStr}`)}
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

        {/* ────────────── メイン：白・ライトグレーベース ────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 p-5 sm:p-8 space-y-5">
          <div className="max-w-xl mx-auto space-y-5">

            {/* トレーニング日数サマリーカード */}
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 bg-white border border-slate-200/60 rounded-2xl flex items-center justify-between shadow-xs relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />
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
                    <div className="text-xl font-mono font-black text-slate-900 tracking-tight">{stats.totalPhrases}</div>
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
                        ? 'bg-indigo-600 text-white font-black shadow-xs ring-4 ring-indigo-50' 
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
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 uppercase">Word</span>
                      <h2 className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                        単語ドリルのトレーニング履歴
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
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 uppercase">Sprint</span>
                      <h2 className="text-xs font-black text-slate-800 group-hover:text-amber-600 transition-colors">
                        スプリントのトレーニング履歴
                      </h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400 mt-1 leading-normal">
                      自主トレーニングした記録を一覧でチェックします。
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

        {/* ────────────── フッター：共通ブランドカラー ────────────── */}
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