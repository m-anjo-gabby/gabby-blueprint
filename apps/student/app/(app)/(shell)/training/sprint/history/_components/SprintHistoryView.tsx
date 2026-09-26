'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Timer, ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { QUESTION_TYPES } from '@gabby/types/sprint';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { resolveSprintHasLevel } from '@gabby/lib';
import type { ContentMetadata } from '@gabby/types/content';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { MonthSwitcher } from '../../../_components/MonthSwitcher';
import { StatTile } from '../../../_components/StatTile';
import { HistoryEmpty, HistoryMetric } from '../../../_components/HistoryParts';

/** ドリル種別ごとの回答数の列（表示順は QUESTION_TYPES の seq_no に合わせる） */
const DRILL_BREAKDOWN_KEYS = [
  { type: '0', countKey: 'speed_count' },
  { type: '5', countKey: 'builders_count' },
  { type: '4', countKey: 'structure_count' },
  { type: '6', countKey: 'mastery_count' },
] as const;

const getContentName = (raw: { content_name: string } | { content_name: string }[] | null | undefined): string =>
  (Array.isArray(raw) ? raw[0]?.content_name : raw?.content_name) || '教材データなし';

const SUB_LIST_TITLE_CLASS = 'px-1 text-xs font-semibold text-ink-muted';

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
  const timezone = useTimezone();

  // 🛠️ 月ナビゲーション（前月/翌月の年またぎ計算・当月判定等）はWord履歴画面と共通のためフック化
  const monthNavigator = useMonthNavigator({
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
      
      groups[date].drills.sort((a, b) => getContentName(a.com_m_contents).localeCompare(getContentName(b.com_m_contents)));
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
    <>
      <ShellPageHeader title="スプリントの履歴" back="/training/performance">
        <MonthSwitcher {...monthNavigator} />
      </ShellPageHeader>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="実施日数" value={sortedDates.length} unit="日" icon={Calendar} />
        <StatTile label="スプリント" value={initialData?.sessions?.length ?? 0} unit="回" metric="sprint" />
        <StatTile label="ドリル" value={initialData?.drills?.length ?? 0} unit="件" metric="drill" />
      </div>

      <div className="space-y-3">
        {sortedDates.length === 0 ? (
          <HistoryEmpty message="この月のスプリントの履歴はありません" />
        ) : (
          sortedDates.map((date) => {
            const { sessions, drills } = groupedData[date] || { sessions: [], drills: [] };
            const isExpanded = expandedDates.includes(date);

            return (
              <div key={date} className="overflow-hidden rounded-card border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => toggleDate(date)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-brand-soft/40 sm:p-5"
                >
                  <div>
                    <p className="text-base font-bold text-ink tabular-nums">{date}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <HistoryMetric metric="sprint" label="スプリント" value={sessions.length} />
                      <HistoryMetric metric="drill" label="ドリル" value={drills.length} />
                    </div>
                  </div>
                  <ChevronDown size={18} className={cn('shrink-0 text-ink-subtle transition-transform duration-200', isExpanded && 'rotate-180')} />
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="border-t border-line bg-canvas"
                    >
                      <div className="space-y-4 p-3 sm:p-4">
                        {/* 1. ドリル履歴一覧（結果画面は無いため表示のみ） */}
                        {drills.length > 0 && (
                          <div className="space-y-2">
                            <p className={SUB_LIST_TITLE_CLASS}>ドリル</p>
                            <ul className="space-y-2">
                              {drills.map((drill) => (
                                <li key={drill.summary_id} className="rounded-control border border-line bg-surface p-3.5">
                                  <p className="truncate text-sm font-semibold text-ink">{getContentName(drill.com_m_contents)}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                                    <HistoryMetric icon={CheckCircle2} label="回答" value={drill.question_count} />
                                    <HistoryMetric metric="speech" label="発話" value={drill.assessment_count} />
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {DRILL_BREAKDOWN_KEYS.filter(({ countKey }) => drill[countKey] > 0).map(({ type, countKey }) => (
                                      <span key={type} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-ink-soft">
                                        {QUESTION_TYPES[type].label}
                                        <span className="ml-1 font-semibold text-ink tabular-nums">{drill[countKey]}</span>
                                      </span>
                                    ))}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 2. スプリントセッション履歴一覧（タップで結果画面へ） */}
                        {sessions.length > 0 && (
                          <div className="space-y-2">
                            <p className={SUB_LIST_TITLE_CLASS}>スプリント</p>
                            <ul className="space-y-2">
                              {sessions.map((session) => {
                                const typeInfo = QUESTION_TYPES[session.question_type as keyof typeof QUESTION_TYPES];
                                const isSpeedMode = session.question_type === '0';
                                const raw = session.com_m_contents;
                                const content = Array.isArray(raw) ? raw[0] : raw;
                                const hasLevel = resolveSprintHasLevel(content?.metadata?.sprint);

                                return (
                                  <li key={session.self_sprint_id}>
                                    <button
                                      id={`session-${session.self_sprint_id}`}
                                      type="button"
                                      onClick={() => router.push(`/training/sprint/history/${session.self_sprint_id}`)}
                                      className={cn(
                                        'group flex w-full items-center justify-between gap-3 rounded-control border border-line bg-surface p-3.5 text-left transition-all hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                                        focusId === session.self_sprint_id && 'border-transparent ring-2 ring-brand-500'
                                      )}
                                    >
                                      <div className="min-w-0 space-y-1">
                                        <p className="truncate text-sm font-semibold text-ink">{getContentName(raw)}</p>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="text-sm text-ink-soft">{typeInfo?.label || 'Sprint'}</span>
                                          {hasLevel && (
                                            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                                              {session.difficulty_level === 0 ? 'Basic' : `Lv.${session.difficulty_level}`}
                                            </span>
                                          )}
                                          {isSpeedMode && (
                                            <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-soft">
                                              {session.answer_type === '1' ? 'NO' : 'YES'}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                          <HistoryMetric icon={Timer} label="制限時間" value={`${session.time_limit_sec}秒`} />
                                          <HistoryMetric icon={CheckCircle2} label="回答" value={session.total_answered} />
                                        </div>
                                      </div>
                                      <ChevronRight size={18} className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
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
    </>
  );
};
