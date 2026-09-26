'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, CalendarDays, type LucideIcon } from 'lucide-react';
import { getContentTypeConfig, getTrainingMetricConfig } from '@gabby/lib/content/ui';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { UserTrainingPerformanceResponse } from '@/actions/performanceAction';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ShellPageHeader, ShellSectionTitle } from '@/components/shell/ShellPage';
import { MonthSwitcher } from '../../_components/MonthSwitcher';
import { StatTile } from '../../_components/StatTile';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// 分類色・アイコン（全アプリ共通の定義から取得）
const WORD_BOOK = getContentTypeConfig(0);
const SPRINT = getContentTypeConfig(2);
const SPEECH = getTrainingMetricConfig('speech');

interface RecordLinkCardProps {
  href: string;
  title: string;
  icon: LucideIcon;
  /** アイコンのマスの分類色 */
  iconTile: string;
  metrics: { label: string; value: number; unit: string }[];
  note?: string;
}

/** トレーニング種別ごとの集計と、その履歴画面への導線 */
function RecordLinkCard({ href, title, icon: Icon, iconTile, metrics, note }: RecordLinkCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-card border border-line bg-surface p-4 sm:p-5 transition-all hover:border-brand-200 active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${iconTile}`}>
          <Icon size={16} />
        </span>
        <span className="flex-1 text-base font-bold text-ink">{title}</span>
        <span className="flex items-center text-sm font-semibold text-brand">
          履歴
          <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-xs text-ink-muted">{metric.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1 tabular-nums">
              <span className="text-2xl font-bold tracking-tight text-ink">{metric.value}</span>
              <span className="text-sm text-ink-muted">{metric.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 text-xs text-ink-subtle">{note}</p>}
    </Link>
  );
}

interface TrainingPerformanceProps {
  initialData: UserTrainingPerformanceResponse;
  targetMonth: string; // 形式: "YYYY-MM"
}

export const TrainingPerformance: React.FC<TrainingPerformanceProps> = ({ initialData, targetMonth }) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const timezone = useTimezone();

  // 🛠️ 月ナビゲーション（前月/翌月の年またぎ計算・当月判定・ペンディング状態）は
  // 単語履歴・スプリント履歴画面と共通のためフック化
  const monthNavigator = useMonthNavigator({
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

  // 2. カレンダーデータの生成（日別サマリー付き）
  const calendarDays = useMemo(() => {
    const [year, month] = targetMonth.split('-').map(Number);

    interface DayDetail {
      wordCount: number;
      phraseCount: number;
      sprintSessionCount: number;
      sprintAnswerCount: number;
      assessmentCount: number;
    }
    const detailMap = new Map<string, DayDetail>();
    const getOrCreate = (dateStr: string): DayDetail => {
      let entry = detailMap.get(dateStr);
      if (!entry) {
        entry = { wordCount: 0, phraseCount: 0, sprintSessionCount: 0, sprintAnswerCount: 0, assessmentCount: 0 };
        detailMap.set(dateStr, entry);
      }
      return entry;
    };

    (initialData?.words || []).forEach(item => {
      const entry = getOrCreate(toIsoDateInZone(item.training_date, timezone));
      entry.wordCount += item.word_count;
      entry.phraseCount += item.phrase_count;
      entry.assessmentCount += item.assessment_count;
    });
    (initialData?.sprint_sessions || []).forEach(item => {
      if (!item.insert_date) return;
      const entry = getOrCreate(toIsoDateInZone(item.insert_date, timezone));
      entry.sprintSessionCount += 1;
      entry.sprintAnswerCount += item.total_answered;
      entry.assessmentCount += item.assessment_count || 0;
    });
    (initialData?.sprint_drills || []).forEach(item => {
      const entry = getOrCreate(toIsoDateInZone(item.training_date, timezone));
      entry.assessmentCount += item.assessment_count;
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const detail = detailMap.get(dateStr);

      days.push({
        dayNum: d,
        dateStr,
        hasHistory: !!detail,
        wordCount: detail?.wordCount ?? 0,
        phraseCount: detail?.phraseCount ?? 0,
        sprintSessionCount: detail?.sprintSessionCount ?? 0,
        sprintAnswerCount: detail?.sprintAnswerCount ?? 0,
        assessmentCount: detail?.assessmentCount ?? 0,
      });
    }
    return days;
  }, [initialData, targetMonth, timezone]);


  // 曜日の列を揃えるため、1日の曜日ぶんだけ先頭に空セルを置く
  const [calendarYear, calendarMonth] = targetMonth.split('-').map(Number);
  const leadingBlankCount = new Date(calendarYear, calendarMonth - 1, 1).getDay();
  const monthLabel = `${parseInt(monthNavigator.displayMonth, 10)}月`;

  return (
    <>
      <ShellPageHeader title="トレーニング記録" back={{ history: '/dashboard' }} description="月ごとのトレーニングの実績を確認できます。">
        <MonthSwitcher {...monthNavigator} />
      </ShellPageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 左: 月のまとめ・種別ごとの実績 */}
        <div className="space-y-6 lg:col-span-3">
          <section>
            <ShellSectionTitle>{monthLabel}のまとめ</ShellSectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatTile label="トレーニング日数" value={stats.activeDays} unit="日" icon={CalendarDays} emphasis />
              <StatTile label="発話回数" value={stats.totalAssessments} unit="回" metric="speech" emphasis />
            </div>
          </section>

          <section>
            <ShellSectionTitle>トレーニング別</ShellSectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <RecordLinkCard
                href={`/training/word/history?month=${targetMonth}`}
                title="単語帳"
                icon={WORD_BOOK.icon}
                iconTile={WORD_BOOK.theme.iconTile}
                metrics={[
                  { label: '単語', value: stats.totalWords, unit: '語' },
                  { label: 'フレーズ', value: stats.totalPhrases, unit: '件' },
                ]}
              />
              <RecordLinkCard
                href={`/training/sprint/history?month=${targetMonth}`}
                title="スプリント"
                icon={SPRINT.icon}
                iconTile={SPRINT.theme.iconTile}
                metrics={[
                  { label: '実施', value: stats.sprintSessions, unit: '回' },
                  { label: '回答', value: stats.sprintAnswers, unit: '問' },
                ]}
                note="※ 回答数にドリルモードの回答は含みません"
              />
            </div>
          </section>
        </div>

        {/* 右: 実施カレンダー */}
        <section className="lg:col-span-2">
          <ShellSectionTitle>実施カレンダー</ShellSectionTitle>
          <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
            <p className="mb-4 text-xs text-ink-muted">色の付いた日をタップすると、その日の内容を確認できます。</p>

            <div className="grid grid-cols-7 gap-1.5 text-center">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="pb-1 text-xs font-medium text-ink-subtle">
                  {label}
                </span>
              ))}

              {Array.from({ length: leadingBlankCount }, (_, i) => (
                <span key={`blank-${i}`} aria-hidden="true" />
              ))}

              {calendarDays.map((day) =>
                day.hasHistory ? (
                  <Popover
                    key={day.dateStr}
                    open={selectedDate === day.dateStr}
                    onOpenChange={(open) => setSelectedDate(open ? day.dateStr : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${monthLabel}${day.dayNum}日の実施内容`}
                        className="mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-control bg-brand text-sm font-bold text-white tabular-nums transition-all hover:bg-brand-strong active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        {day.dayNum}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="center" collisionPadding={12} className="w-64 rounded-control border-line p-4 shadow-lg">
                      <p className="border-b border-line pb-2 text-sm font-bold text-ink">
                        {monthLabel}
                        {day.dayNum}日の実施内容
                      </p>
                      <dl className="mt-2 space-y-1.5 text-sm">
                        {(day.wordCount > 0 || day.phraseCount > 0) && (
                          <DayDetailRow icon={WORD_BOOK.icon} iconColor={WORD_BOOK.theme.iconText} label="単語帳" value={`${day.wordCount}語 / ${day.phraseCount}フレーズ`} />
                        )}
                        {day.sprintSessionCount > 0 && (
                          <DayDetailRow icon={SPRINT.icon} iconColor={SPRINT.theme.iconText} label="スプリント" value={`${day.sprintSessionCount}回 / ${day.sprintAnswerCount}問`} />
                        )}
                        <DayDetailRow icon={SPEECH.icon} iconColor={SPEECH.theme.iconText} label="発話回数" value={`${day.assessmentCount}回`} />
                      </dl>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span
                    key={day.dateStr}
                    className="mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-control text-sm text-ink-subtle tabular-nums"
                  >
                    {day.dayNum}
                  </span>
                )
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

function DayDetailRow({ icon: Icon, iconColor, label, value }: { icon: LucideIcon; iconColor: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-ink-muted">
        <Icon size={14} className={iconColor} />
        {label}
      </dt>
      <dd className="font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
