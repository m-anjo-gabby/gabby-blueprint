'use client';

import { useMemo } from 'react';
import { CheckCircle2, Download, Users } from 'lucide-react';
import type { MonitorSprintHistoryResponse, MonitorUser, MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';
import { formatZonedDate } from '@gabby/lib/date/date';
import { REPORTING_TIMEZONE, currentReportingMonth } from '@gabby/lib/date/reporting';
import { clientLogger } from '@gabby/lib/logger/client';
import { TrainingMetricIcon } from '@/components/common/TrainingMetricIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HistoryEmpty } from '../../training/_components/HistoryParts';
import { MonthSwitcher } from '../../training/_components/MonthSwitcher';
import { MonitorMonthPickerPopover } from './MonitorMonthPickerPopover';
import { MonitorUserName } from './MonitorParts';
import { downloadCsv, getMonthRange, isMonitorAccount, toDayLabel, type MonitorQuery } from './monitorQuery';
import { useMonitorNavigation } from './useMonitorNavigation';

interface UserStats {
  days: Set<string>;
  phrases: number;
  sprintSessions: number;
  sprintAnswers: number;
  assessments: number;
  /** 最終実施日（YYYY-MM-DD） */
  latestDate: string | null;
}

const emptyStats = (): UserStats => ({ days: new Set(), phrases: 0, sprintSessions: 0, sprintAnswers: 0, assessments: 0, latestDate: null });

type LicenseState = MonitorUser['license_state'];

/** ライセンス状態（現時点での状態）。受講生サマリーの対象は本登録済みの受講生のみのため、招待系の状態は発生しない */
const LICENSE_STATE: Partial<Record<LicenseState, { label: string; className: string }>> = {
  active: { label: '利用中', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  expired: { label: '期限切れ', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  future: { label: '開始前', className: 'border-line bg-canvas text-ink-muted' },
};
const UNKNOWN_STATE = { label: '不明', className: 'border-line bg-canvas text-ink-muted' };

/** 一覧の列（lg 以上）。見出しと各行で共有する */
const TABLE_GRID = 'lg:grid-cols-[minmax(0,1.8fr)_6rem_7.5rem_repeat(5,minmax(0,0.7fr))_6.5rem]';

interface MonitorUserListProps {
  users: MonitorUser[];
  wordHistory: MonitorWordSummaryHistoryItem[];
  sprintHistory: MonitorSprintHistoryResponse;
  /** 表示中の条件（期間は当月の既定値を解決済み） */
  query: MonitorQuery & { startDate: string; endDate: string };
}

export function MonitorUserList({ users, wordHistory, sprintHistory, query }: MonitorUserListProps) {
  const { navigate, isPending } = useMonitorNavigation(query);
  const targetMonth = query.startDate.slice(0, 7);
  // 期間・ライセンス期間は集計期間のタイムゾーン（日本時間）で表示する
  const thisMonth = currentReportingMonth();

  const goToMonth = (yearMonth: string) => navigate(getMonthRange(yearMonth));
  const [displayYear, displayMonth] = targetMonth.split('-');
  const monthNavigator = {
    currentMonthStr: thisMonth,
    displayYear,
    displayMonth,
    isNotCurrentMonth: targetMonth !== thisMonth,
    goToMonth,
    handleMonthChange: (direction: 'prev' | 'next') => {
      const [year, month] = targetMonth.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1 + (direction === 'prev' ? -1 : 1), 1));
      goToMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    },
    isPending,
  };

  const userStats = useMemo(() => {
    const statsMap = new Map<string, UserStats>();
    const record = (userId: string, date: string, apply: (s: UserStats) => void) => {
      const stats = statsMap.get(userId) ?? emptyStats();
      stats.days.add(date);
      if (!stats.latestDate || date > stats.latestDate) stats.latestDate = date;
      apply(stats);
      statsMap.set(userId, stats);
    };

    // 単語ドリル（training_date は DATE）
    wordHistory.forEach((h) =>
      record(h.user_id, h.training_date, (s) => {
        s.phrases += h.phrase_count;
        s.assessments += h.assessment_count;
      })
    );
    // スプリント（実施した生徒のタイムゾーンでの実施日。RPCで算出済み）
    sprintHistory.sessions.forEach((h) =>
      record(h.user_id, h.training_date, (s) => {
        s.sprintSessions += 1;
        s.sprintAnswers += h.total_answered;
        s.assessments += h.total_assessments || 0;
      })
    );
    // スプリントドリル（training_date は DATE）
    sprintHistory.drills.forEach((h) =>
      record(h.user_id, h.training_date, (s) => {
        s.assessments += h.assessment_count;
      })
    );

    return statsMap;
  }, [wordHistory, sprintHistory]);

  const formatDate = (value: string | null) => formatZonedDate(value, REPORTING_TIMEZONE) || '—';

  const handleExportCSV = () => {
    clientLogger.info('monitor:user_summary_csv_exported', `User summary CSV exported: ${targetMonth}`, {
      payload: { month: targetMonth, targetUserIds: users.map((u) => u.id), rowCount: users.length },
    });

    const rows = users.map((user) => {
      const stats = userStats.get(user.id) ?? emptyStats();
      return [
        user.user_name || '未設定',
        (LICENSE_STATE[user.license_state] ?? UNKNOWN_STATE).label,
        formatDate(user.license_start_date),
        formatDate(user.license_end_date),
        `${stats.days.size}日`,
        stats.phrases,
        stats.sprintSessions,
        stats.sprintAnswers,
        stats.assessments,
        stats.latestDate ? toDayLabel(stats.latestDate) : 'なし',
      ];
    });
    downloadCsv(
      `blueprint_user_summary_${targetMonth}${query.includeMonitor ? '_with_monitor' : ''}.csv`,
      ['受講生', 'ステータス', 'ライセンス開始日', 'ライセンス終了日', 'トレーニング日数', 'フレーズ数', 'スプリント本数', 'スプリント回答数', '発話数', '最終実施日'],
      rows
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MonthSwitcher {...monthNavigator} />
          <MonitorMonthPickerPopover currentMonth={targetMonth} onSelect={goToMonth} disabled={isPending} />
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={users.length === 0}
          icon={<Download />}
          className="h-10 rounded-control border-line bg-surface px-4 text-sm font-semibold text-ink-soft shadow-none"
        >
          CSVエクスポート
        </Button>
      </div>

      <div aria-busy={isPending} className={cn('transition-opacity', isPending && 'opacity-60')}>
        {users.length === 0 ? (
          <HistoryEmpty
            icon={Users}
            message={
              query.includeMonitor
                ? 'この年月に該当する受講生が見つかりません'
                : 'この年月に該当する受講生が見つかりません（モニター用アカウントのみの場合は「モニターを含める」をオンにしてください）'
            }
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className={cn('hidden items-center gap-4 border-b border-line bg-canvas px-5 py-2.5 text-xs font-semibold text-ink-muted lg:grid', TABLE_GRID)}>
              <span>受講生</span>
              <span className="text-center">ステータス</span>
              <span className="text-center">ライセンス期間</span>
              <span className="text-center">日数</span>
              <HeaderMetric icon={<TrainingMetricIcon metric="phrase" size={12} />} label="フレーズ" />
              <HeaderMetric icon={<TrainingMetricIcon metric="sprint" size={12} />} label="スプリント" />
              <HeaderMetric icon={<CheckCircle2 size={12} className="shrink-0 text-ink-subtle" />} label="回答" />
              <HeaderMetric icon={<TrainingMetricIcon metric="speech" size={12} />} label="発話" />
              <span className="text-right">最終実施日</span>
            </div>

            <ul className="divide-y divide-line">
              {users.map((user) => {
                const stats = userStats.get(user.id) ?? emptyStats();
                const state = LICENSE_STATE[user.license_state] ?? UNKNOWN_STATE;

                return (
                  <li key={user.id} className={cn('grid gap-3 px-4 py-4 sm:px-5 lg:items-center lg:gap-4 lg:py-3', TABLE_GRID)}>
                    <div className="min-w-0">
                      <MonitorUserName name={user.user_name} isMonitor={isMonitorAccount(user)} className="text-sm" />
                      <p className="truncate text-xs text-ink-muted">{user.email}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:contents">
                      <Cell label="ステータス">
                        <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', state.className)}>{state.label}</span>
                      </Cell>
                      <Cell label="ライセンス期間">
                        <span className="text-xs text-ink-soft tabular-nums">
                          {formatDate(user.license_start_date)} 〜{' '}
                          <br className="max-lg:hidden" />
                          {formatDate(user.license_end_date)}
                        </span>
                      </Cell>
                      <Cell label="トレーニング日数">
                        <Value value={stats.days.size} unit="日" />
                      </Cell>
                      <Cell label="フレーズ">
                        <Value value={stats.phrases} />
                      </Cell>
                      <Cell label="スプリント">
                        <Value value={stats.sprintSessions} unit="本" />
                      </Cell>
                      <Cell label="回答">
                        <Value value={stats.sprintAnswers} />
                      </Cell>
                      <Cell label="発話">
                        <Value value={stats.assessments} />
                      </Cell>
                      <Cell label="最終実施日" align="end">
                        {stats.latestDate ? (
                          <span className="text-sm text-ink-soft tabular-nums">{toDayLabel(stats.latestDate)}</span>
                        ) : (
                          <span className="text-sm text-ink-subtle">活動なし</span>
                        )}
                      </Cell>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function HeaderMetric({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-1">
      {icon}
      {label}
    </span>
  );
}

/** 一覧の1項目。lg 未満は項目名を上に添え、lg 以上は見出し行の列に揃える */
function Cell({ label, align = 'center', children }: { label: string; align?: 'center' | 'end'; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col items-start gap-1', align === 'end' ? 'lg:items-end' : 'lg:items-center')}>
      <span className="text-xs text-ink-muted lg:hidden">{label}</span>
      {children}
    </div>
  );
}

function Value({ value, unit }: { value: number; unit?: string }) {
  return (
    <span className="text-sm font-semibold text-ink tabular-nums">
      {value}
      {unit && <span className="ml-0.5 text-xs font-normal text-ink-muted">{unit}</span>}
    </span>
  );
}
