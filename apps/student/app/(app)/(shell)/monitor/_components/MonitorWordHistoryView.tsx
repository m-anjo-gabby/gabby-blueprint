'use client';

import { useMemo, useState } from 'react';
import type { MonitorUser, MonitorWordSummaryHistoryItem } from '@/actions/monitorAction';
import { logClientEvent } from '@gabby/lib/logger/actions';
import { cn } from '@/lib/utils';
import { HistoryEmpty, HistoryMetric } from '../../training/_components/HistoryParts';
import { MonitorFilterBar } from './MonitorFilterBar';
import { MONITOR_DAYS_PER_PAGE, MonitorDayCard, MonitorDayRow, MonitorPager, MonitorUserName } from './MonitorParts';
import { downloadCsv, getMonitorAccountIds, toDayLabel, type MonitorQuery } from './monitorQuery';
import { useMonitorNavigation } from './useMonitorNavigation';

interface MonitorWordHistoryViewProps {
  initialData: MonitorWordSummaryHistoryItem[];
  users: MonitorUser[];
  /** 表示中の条件（期間は当月の既定値を解決済み） */
  query: MonitorQuery & { startDate: string; endDate: string };
}

const byUserThenContent = (a: MonitorWordSummaryHistoryItem, b: MonitorWordSummaryHistoryItem) =>
  (a.com_m_user?.user_name || '').localeCompare(b.com_m_user?.user_name || '', 'ja') ||
  (a.com_m_contents?.content_name || '').localeCompare(b.com_m_contents?.content_name || '', 'ja');

export function MonitorWordHistoryView({ initialData, users, query }: MonitorWordHistoryViewProps) {
  const { startDate, endDate, userIds = [], includeMonitor } = query;
  const { navigate, isPending } = useMonitorNavigation(query);
  const [page, setPage] = useState(1);
  const monitorIds = useMemo(() => getMonitorAccountIds(users), [users]);

  // training_date は DATE（YYYY-MM-DD）のため、タイムゾーン変換せずにそのまま日付として扱う
  const { groups, sortedDates } = useMemo(() => {
    const map = new Map<string, MonitorWordSummaryHistoryItem[]>();
    initialData.forEach((item) => map.set(item.training_date, [...(map.get(item.training_date) ?? []), item]));
    map.forEach((items) => items.sort(byUserThenContent));
    return { groups: map, sortedDates: [...map.keys()].sort((a, b) => b.localeCompare(a)) };
  }, [initialData]);

  const totalPages = Math.ceil(sortedDates.length / MONITOR_DAYS_PER_PAGE);
  const pagedDates = sortedDates.slice((page - 1) * MONITOR_DAYS_PER_PAGE, page * MONITOR_DAYS_PER_PAGE);

  const applyFilters = (patch: Partial<MonitorQuery>) => {
    setPage(1);
    navigate(patch);
  };

  const handleExportCSV = () => {
    logClientEvent({
      service: 'student',
      event: 'monitor:word_history_csv_exported',
      level: 'info',
      message: `Word history CSV exported: ${startDate}~${endDate}`,
      payload: { startDate, endDate, targetUserIds: userIds, rowCount: initialData.length },
    }).catch(() => {});

    const rows = sortedDates.flatMap((date) =>
      (groups.get(date) ?? []).map((s) => [
        toDayLabel(date),
        s.com_m_user?.user_name || '未設定',
        s.com_m_contents?.content_name || '教材名なし',
        s.word_count,
        s.phrase_count,
        s.assessment_count,
      ])
    );
    downloadCsv(
      `blueprint_word_drill_history_${startDate}_to_${endDate}${includeMonitor ? '_with_monitor' : ''}.csv`,
      ['日付', '受講生名', 'トレーニング教材', '単語数', 'フレーズ数', '発話評価数'],
      rows
    );
  };

  return (
    <>
      <MonitorFilterBar
        key={`${startDate}_${endDate}`}
        users={users}
        monitorIds={monitorIds}
        startDate={startDate}
        endDate={endDate}
        selectedUserIds={userIds}
        onApply={applyFilters}
        isPending={isPending}
        onExport={handleExportCSV}
        exportDisabled={initialData.length === 0}
      />

      <div aria-busy={isPending} className={cn('space-y-3 transition-opacity', isPending && 'opacity-60')}>
        {sortedDates.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              <span className="font-semibold text-ink tabular-nums">{sortedDates.length}</span>日分の履歴
            </p>
            <MonitorPager page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}

        {pagedDates.length === 0 ? (
          <HistoryEmpty message="該当する履歴はありません" />
        ) : (
          pagedDates.map((date) => {
            const sessions = groups.get(date) ?? [];
            const sum = (key: 'word_count' | 'phrase_count' | 'assessment_count') => sessions.reduce((acc, s) => acc + s[key], 0);

            return (
              <MonitorDayCard
                key={date}
                date={date}
                metrics={
                  <>
                    <HistoryMetric metric="word" label="単語" value={sum('word_count')} />
                    <HistoryMetric metric="phrase" label="フレーズ" value={sum('phrase_count')} />
                    <HistoryMetric metric="speech" label="発話" value={sum('assessment_count')} />
                  </>
                }
              >
                {sessions.map((s) => (
                  <MonitorDayRow
                    key={`${s.user_id}-${s.content_id}`}
                    user={<MonitorUserName name={s.com_m_user?.user_name} isMonitor={monitorIds.has(s.user_id)} />}
                    content={<span className="block truncate text-ink-soft">{s.com_m_contents?.content_name || '教材名なし'}</span>}
                    metrics={
                      <>
                        <HistoryMetric metric="word" label="単語" value={s.word_count} />
                        <HistoryMetric metric="phrase" label="フレーズ" value={s.phrase_count} />
                        <HistoryMetric metric="speech" label="発話" value={s.assessment_count} />
                      </>
                    }
                  />
                ))}
              </MonitorDayCard>
            );
          })
        )}
      </div>
    </>
  );
}
