'use client';

import React, { useMemo, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { motion, AnimatePresence } from 'framer-motion';
import { WordSummaryHistoryItem } from '@/actions/wordAction';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { MonthSwitcher } from '../../../_components/MonthSwitcher';
import { StatTile } from '../../../_components/StatTile';
import { HistoryEmpty, HistoryMetric } from '../../../_components/HistoryParts';

interface WordHistoryViewProps {
  initialData: WordSummaryHistoryItem[];
  targetMonth: string; // 形式: "YYYY-MM"
}

interface GroupedWordHistory {
  [date: string]: WordSummaryHistoryItem[];
}

export const WordHistoryView: React.FC<WordHistoryViewProps> = ({ initialData, targetMonth }) => {
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const timezone = useTimezone();

  // 🛠️ 月ナビゲーション（前月/翌月の年またぎ計算等）はSprint履歴画面と共通のためフック化
  const monthNavigator = useMonthNavigator({
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
    <>
      <ShellPageHeader title="単語帳の履歴" back="/training/performance">
        <MonthSwitcher {...monthNavigator} />
      </ShellPageHeader>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="実施日数" value={sortedDates.length} unit="日" icon={Calendar} />
        <StatTile label="単語" value={monthlyTotals.words} unit="語" metric="word" />
        <StatTile label="フレーズ" value={monthlyTotals.phrases} unit="件" metric="phrase" />
      </div>

      <div className="space-y-3">
        {sortedDates.length === 0 ? (
          <HistoryEmpty message="この月の単語帳の履歴はありません" />
        ) : (
          sortedDates.map((date) => {
            const sessions = groupedData[date];
            const isExpanded = expandedDates.includes(date);

            const totalWordsDay = sessions.reduce((acc, s) => acc + s.word_count, 0);
            const totalPhrasesDay = sessions.reduce((acc, s) => acc + s.phrase_count, 0);
            const totalAssessmentsDay = sessions.reduce((acc, s) => acc + s.assessment_count, 0);

            return (
              <motion.div key={date} layout="position" className="overflow-hidden rounded-card border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => toggleDate(date)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-brand-soft/40 sm:p-5"
                >
                  <div>
                    <p className="text-base font-bold text-ink tabular-nums">{date}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <HistoryMetric metric="word" label="単語" value={totalWordsDay} />
                      <HistoryMetric metric="phrase" label="フレーズ" value={totalPhrasesDay} />
                      <HistoryMetric metric="speech" label="発話" value={totalAssessmentsDay} />
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
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="border-t border-line bg-canvas"
                    >
                      <ul className="space-y-2 p-3 sm:p-4">
                        {sessions.map((session) => (
                          <li key={session.content_id} className="rounded-control border border-line bg-surface p-3.5">
                            <p className="text-sm font-semibold text-ink">{session.com_m_contents?.content_name || '教材データなし'}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                              <HistoryMetric metric="word" label="単語" value={session.word_count} />
                              <HistoryMetric metric="phrase" label="フレーズ" value={session.phrase_count} />
                              <HistoryMetric metric="speech" label="発話" value={session.assessment_count} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>
    </>
  );
};
