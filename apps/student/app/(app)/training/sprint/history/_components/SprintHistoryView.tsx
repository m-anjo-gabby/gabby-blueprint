'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Calendar, Zap, ArrowRight, History, Timer, ArrowLeft, ChevronRight, Sliders, CheckCircle2, Mic, Loader2, Home } from 'lucide-react';
import { cn } from "@/lib/utils";
import { QUESTION_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { resolveSprintHasLevel } from '@gabby/lib';
import type { ContentMetadata } from '@gabby/types/content';

interface HistorySession {
  self_sprint_id: string;
  sprint_type: string;
  content_id: string;
  question_type: string;
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  insert_date: string;
  com_m_contents?: {
    content_name: string;
    metadata?: ContentMetadata | null;
  } | {
    content_name: string;
    metadata?: ContentMetadata | null;
  }[] | null;
}

interface HistoryDrillSummary {
  summary_id: string;
  user_id: string;
  content_id: string;
  training_date: string;
  question_count: number;
  assessment_count: number;
  speed_count: number;
  structure_count: number;
  builders_count: number;
  mastery_count: number;
  com_m_contents?: {
    content_name: string;
  } | { content_name: string }[] | null;
}

interface SprintHistoryViewProps {
  initialData: {
    sessions: HistorySession[];
    drills: HistoryDrillSummary[];
  };
  targetMonth: string; // 形式: "YYYY-MM"
}

export const SprintHistoryView: React.FC<SprintHistoryViewProps> = ({ initialData, targetMonth }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  // 🌍 ユーザーマスタからタイムゾーンを取得（未設定時は Asia/Tokyo にフォールバック）
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  // 🛠️ 月ナビゲーション（前月/翌月の年またぎ計算・当月判定等）はWord履歴画面と共通のためフック化
  const { currentMonthStr, displayYear, displayMonth, isNotCurrentMonth, handleMonthChange, goToMonth, isPending } = useMonthNavigator({
    targetMonth,
    basePath: '/training/sprint/history',
  });

  // 🎯 初期レンダリング時に URL パラメータから展開すべき日付を特定する
  const [expandedDates, setExpandedDates] = useState<string[]>(() => {
    const sessions = initialData?.sessions || [];
    if (!focusId || !sessions.length) return [];
    const targetSession = sessions.find(s => s.self_sprint_id === focusId);
    if (targetSession) {
      // 💡 外部関数を呼ばず、直接タイムゾーン関数を使用
      return [formatZonedDate(targetSession.insert_date, timezone)];
    }
    return [];
  });

  // 🎯 スクロール処理のみを Effect で行う（expandedDates は初期化時点で同期的に確定済みのため、
  // 対象要素は通常は次の描画で存在する。requestAnimationFrame でペイント後の存在確認を
  // 数フレームだけリトライし、100ms間隔のポーリングより軽量かつ高速に解決する）
  useEffect(() => {
    if (!focusId) return;

    let rafId: number;
    let attempts = 0;
    const tryScroll = () => {
      const element = document.getElementById(`session-${focusId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
      }
      attempts++;
      if (attempts < 10) {
        rafId = requestAnimationFrame(tryScroll);
      }
    };
    rafId = requestAnimationFrame(tryScroll);

    return () => cancelAnimationFrame(rafId);
  }, [focusId]);

  // 💡 日付ごとにグループ化（React Compiler が確実に自動追随できるよう最適化）
  const groupedData = useMemo(() => {
    const groups: Record<string, { sessions: HistorySession[]; drills: HistoryDrillSummary[] }> = {};
    
    const sessions = initialData?.sessions || [];
    const drills = initialData?.drills || [];

    sessions.forEach(session => {
      const dateStr = formatZonedDate(session.insert_date, timezone);
      if (!groups[dateStr]) {
        groups[dateStr] = { sessions: [], drills: [] };
      }
      groups[dateStr].sessions.push(session);
    });

    drills.forEach(drill => {
      const dateStr = formatZonedDate(drill.training_date, timezone);
      if (!groups[dateStr]) {
        groups[dateStr] = { sessions: [], drills: [] };
      }
      groups[dateStr].drills.push(drill);
    });

    // 各日のセッションを「実施順（昇順）」にソート
    Object.keys(groups).forEach(date => {
      groups[date].sessions.sort((a, b) => new Date(a.insert_date).getTime() - new Date(b.insert_date).getTime());
      
      groups[date].drills.sort((a, b) => {
        const nameA = (Array.isArray(a.com_m_contents) ? a.com_m_contents[0]?.content_name : a.com_m_contents?.content_name) || '';
        const nameB = (Array.isArray(b.com_m_contents) ? b.com_m_contents[0]?.content_name : b.com_m_contents?.content_name) || '';
        return nameA.localeCompare(nameB);
      });
    });

    return groups;
  }, [initialData, timezone]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  // ソートの最適化：標準化した文字列（YYYY/MM/DD）で高速に降順ソート
  const sortedDates = useMemo(() => {
    return Object.keys(groupedData).sort((a, b) => b.localeCompare(a));
  }, [groupedData]);

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50/60 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-none select-none text-slate-900 selection:bg-indigo-100">
      <div className="w-full max-w-2xl h-full max-h-[95vh] bg-white border border-slate-200/80 rounded-[32px] sm:rounded-[40px] shadow-xl flex flex-col overflow-hidden animate-fade-in">
        
        {/* ────────────── ヘッダー ────────────── */}
        <div className="shrink-0 bg-indigo-50/60 border-b border-indigo-100/40 p-5 sm:p-6 relative overflow-hidden space-y-3">
          <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
            <History size={115} strokeWidth={1.2} className="text-indigo-600" />
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
                Sprint History
              </span>
              <p className="text-[9px] font-bold text-slate-400 opacity-90 mt-0.5">
                スプリントの学習履歴
              </p>
            </div>
          </div>

          {/* Row2: 月移動
              💡 今月ボタンの有無に関わらず月カプセルが常に中央に来るよう、
              左右を1frの空セルで挟んだ3カラムgridで配置する（左右セル幅は常に等しい） */}
          <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div aria-hidden="true" />

            <div className="justify-self-center inline-flex items-center bg-white border border-slate-200/80 shadow-sm rounded-xl p-0.5">
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
            </div>

            {/* 「今月」ボタン */}
            <div className="flex items-center justify-start">
              <AnimatePresence>
                {isNotCurrentMonth && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    onClick={() => goToMonth(currentMonthStr)}
                    disabled={isPending}
                    className="ml-3 px-2.5 py-1 text-xs font-bold text-indigo-600 bg-white border border-indigo-100 rounded-lg hover:bg-indigo-50/80 hover:border-indigo-200 transition-all active:scale-95 shadow-xs font-sans cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none"
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
                <Zap size={13} fill="currentColor" className="text-amber-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">スプリント</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{initialData?.sessions?.length ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
                <Sliders size={13} strokeWidth={2.5} className="text-indigo-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">ドリル</span>
                <span className="text-sm font-black text-slate-800 font-mono leading-none">{initialData?.drills?.length ?? 0}</span>
              </div>
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
            sortedDates.map((date) => {
              const { sessions, drills } = groupedData[date] || { sessions: [], drills: [] };
              const isExpanded = expandedDates.includes(date);

              return (
                <div key={date} className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full p-5 sm:p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="text-left">
                      <div className="text-sm font-bold text-slate-800 tracking-tight mb-1.5">{date}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs font-black text-slate-400 uppercase tracking-wider font-mono flex-wrap">
                        <span className="flex items-center gap-0.5">
                          <Zap size={11} fill="currentColor" className="text-amber-500" />
                          スプリント {sessions.length}
                        </span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full" />
                        <span className="text-indigo-500 flex items-center gap-0.5">
                          <Sliders size={11} className="text-indigo-500" />
                          ドリル {drills.length}
                        </span>
                      </div>
                    </div>
                    <div className={cn("transition-transform duration-300", isExpanded ? "rotate-180" : "")}>
                      <ChevronRight size={20} className="text-slate-300" />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="border-t border-slate-50 bg-slate-50/30"
                      >
                        <div className="p-4 sm:p-5 space-y-4">
                          {/* 1. ドリル履歴一覧 */}
                          {drills.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1">
                                ドリル
                              </div>
                              <div className="space-y-2">
                                {drills.map((drill) => {
                                  return (
                                    <div
                                      key={drill.summary_id}
                                      className="flex items-center justify-between p-3.5 bg-white border border-dashed border-slate-200 rounded-2xl transition-all"
                                    >
                                      <div className="space-y-1">
                                        {/* 1段目: 教材名 */}
                                        <div className="text-xs font-bold text-slate-500 truncate max-w-[280px] sm:max-w-xs">
                                          {(() => {
                                            const raw = drill.com_m_contents;
                                            const name = Array.isArray(raw) ? raw[0]?.content_name : raw?.content_name;
                                            return name || '教材データなし';
                                          })()}
                                        </div>
                                        {/* 2段目: 回答数と発話数 */}
                                        <div className="text-xs font-black text-slate-800 flex items-center gap-3 flex-wrap">
                                          <span className="flex items-center gap-1">
                                            <CheckCircle2 size={13} className="text-indigo-500 shrink-0" strokeWidth={2.5} />
                                            回答 <span className="font-mono font-extrabold text-indigo-600">{drill.question_count}</span>
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <Mic size={13} className="text-rose-500 shrink-0 stroke-[2.5]" />
                                            発話 <span className="font-mono font-extrabold text-rose-600">{drill.assessment_count}</span>
                                          </span>
                                        </div>
                                        {/* 3段目: 各種別の内訳 */}
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-400 flex-wrap">
                                          {drill.speed_count > 0 && (
                                            <span className="flex items-center gap-1">
                                              <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-1 rounded leading-none py-0.5">SPEED</span>
                                              <span className="font-mono text-slate-700 font-extrabold">{drill.speed_count}</span>
                                            </span>
                                          )}
                                          {drill.structure_count > 0 && (
                                            <span className="flex items-center gap-1">
                                              <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-1 rounded leading-none py-0.5">STR</span>
                                              <span className="font-mono text-slate-700 font-extrabold">{drill.structure_count}</span>
                                            </span>
                                          )}
                                          {drill.builders_count > 0 && (
                                            <span className="flex items-center gap-1">
                                              <span className="text-[10px] font-black text-sky-500 bg-sky-50 px-1 rounded leading-none py-0.5">BLD</span>
                                              <span className="font-mono text-slate-700 font-extrabold">{drill.builders_count}</span>
                                            </span>
                                          )}
                                          {drill.mastery_count > 0 && (
                                            <span className="flex items-center gap-1">
                                              <span className="text-[10px] font-black text-purple-500 bg-purple-50 px-1 rounded leading-none py-0.5">MST</span>
                                              <span className="font-mono text-slate-700 font-extrabold">{drill.mastery_count}</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 2. スプリントセッション履歴一覧 */}
                          {sessions.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-black text-slate-400 uppercase tracking-wider px-1">
                                スプリント
                              </div>
                              <div className="space-y-2">
                                {sessions.map((session) => {
                                  const typeInfo = QUESTION_TYPES[session.question_type as keyof typeof QUESTION_TYPES];
                                  const isSpeedMode = session.question_type === '0';
                                  const raw = session.com_m_contents;
                                  const name = (Array.isArray(raw) ? raw[0]?.content_name : raw?.content_name) || '教材データなし';
                                  const content = Array.isArray(raw) ? raw[0] : raw;
                                  const hasLevel = resolveSprintHasLevel(content?.metadata?.sprint);

                                  return (
                                    <button
                                      key={session.self_sprint_id}
                                      id={`session-${session.self_sprint_id}`}
                                      type="button"
                                      onClick={() => router.push(`/training/sprint/result/${session.self_sprint_id}`)}
                                      className={cn(
                                        "w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all group cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                                        focusId === session.self_sprint_id && "ring-2 ring-blue-500 border-transparent bg-blue-50/30 shadow-sm"
                                      )}
                                    >
                                      <div className="space-y-1">
                                        {/* 1段目: 教材名 */}
                                        <div className="text-xs font-bold text-slate-500 truncate max-w-[280px] sm:max-w-xs">
                                          {name}
                                        </div>

                                        {/* 2段目: メタ情報 (種別, レベル, 形式など) */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs font-black text-slate-800 mr-0.5">{typeInfo?.label || 'Sprint'}</span>
                                          {hasLevel && (
                                            <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 whitespace-nowrap">
                                              {session.difficulty_level === 0 ? 'Basic' : `Lv.${session.difficulty_level}`}
                                            </span>
                                          )}

                                          {isSpeedMode && (
                                            <span className={cn(
                                              "text-[11px] font-black px-1.5 py-0.5 rounded-md border tracking-wider whitespace-nowrap",
                                              session.answer_type === '1'
                                                ? "bg-amber-50 border-amber-100 text-amber-600"
                                                : "bg-emerald-50 border-emerald-100 text-emerald-600"
                                            )}>
                                              {session.answer_type === '1' ? 'NO' : 'YES'}
                                            </span>
                                          )}
                                        </div>

                                        {/* 3段目: 実施結果数値 (時間, 回答数など) */}
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-400 flex-wrap">
                                          <span className="flex items-center gap-1"><Timer size={11} /> {session.time_limit_sec}秒</span>
                                          <span className="flex items-center gap-1">
                                            <CheckCircle2 size={11} className="text-indigo-500 shrink-0" strokeWidth={2.5} />
                                            回答 <span className="font-mono font-extrabold text-slate-800">{session.total_answered}</span>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-200 bg-slate-50 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                                        <ArrowRight size={14} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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