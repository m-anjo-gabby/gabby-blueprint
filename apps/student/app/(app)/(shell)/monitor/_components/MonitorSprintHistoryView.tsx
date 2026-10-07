'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { MonitorSprintHistoryResponse, MonitorUser } from '@/actions/monitorAction';
import { logClientEvent } from '@gabby/lib/logger/actions';
import { TrainingMetricIcon } from '@/components/common/TrainingMetricIcon';
import { cn } from '@/lib/utils';
import { HistoryEmpty, HistoryMetric } from '../../training/_components/HistoryParts';
import { MonitorFilterBar } from './MonitorFilterBar';
import { MONITOR_DAYS_PER_PAGE, MonitorDayCard, MonitorDayRow, MonitorPager, MonitorUserName } from './MonitorParts';
import { downloadCsv, getMonitorAccountIds, toDayLabel, type MonitorQuery } from './monitorQuery';
import { useMonitorNavigation } from './useMonitorNavigation';
import { SPRINT_MODE_LABEL } from '@gabby/lib/content/ui';

/** 受講生・教材・種別（スプリント／ドリル）ごとに1日分を集約した行 */
interface SprintDayItem {
  key: string;
  mode: 'sprint' | 'drill';
  /** YYYY-MM-DD */
  date: string;
  userId: string;
  userName: string;
  contentId: string;
  contentName: string;
  /** タイムアタックの回数（ドリルは回数の概念が無いため null） */
  sprintCount: number | null;
  answeredCount: number;
  assessmentCount: number;
}

interface MonitorSprintHistoryViewProps {
  initialData: MonitorSprintHistoryResponse;
  users: MonitorUser[];
  /** 表示中の条件（期間は当月の既定値を解決済み） */
  query: MonitorQuery & { startDate: string; endDate: string };
}

export function MonitorSprintHistoryView({ initialData, users, query }: MonitorSprintHistoryViewProps) {
  const { startDate, endDate, userIds = [], includeMonitor } = query;
  const { navigate, isPending } = useMonitorNavigation(query);
  const [page, setPage] = useState(1);
  const monitorIds = useMemo(() => getMonitorAccountIds(users), [users]);

  const { groups, sortedDates, totalItems } = useMemo(() => {
    const map = new Map<string, SprintDayItem>();
    const add = (item: Omit<SprintDayItem, 'key'>) => {
      const key = `${item.date}-${item.userId}-${item.mode}-${item.contentId}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...item, key });
        return;
      }
      existing.sprintCount = existing.sprintCount === null ? null : existing.sprintCount + (item.sprintCount ?? 0);
      existing.answeredCount += item.answeredCount;
      existing.assessmentCount += item.assessmentCount;
    };

    // スプリントは実施した生徒のタイムゾーンでの実施日（RPCで算出済み）
    initialData.sessions.forEach((s) =>
      add({
        mode: 'sprint',
        date: s.training_date,
        userId: s.user_id,
        userName: s.com_m_user?.user_name || '未設定',
        contentId: s.content_id,
        contentName: s.com_m_contents?.content_name || '教材名なし',
        sprintCount: 1,
        answeredCount: s.total_answered,
        assessmentCount: s.total_assessments || 0,
      })
    );
    // ドリルの集計は日付（DATE）単位
    initialData.drills.forEach((d) =>
      add({
        mode: 'drill',
        date: d.training_date,
        userId: d.user_id,
        userName: d.com_m_user?.user_name || '未設定',
        contentId: d.content_id,
        contentName: d.com_m_contents?.content_name || '教材名なし',
        sprintCount: null,
        answeredCount: d.question_count,
        assessmentCount: d.assessment_count,
      })
    );

    // 日付内は受講生名 → ドリル・スプリントの順 → 教材名で並べる
    const byDate = new Map<string, SprintDayItem[]>();
    map.forEach((item) => byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]));
    byDate.forEach((items) =>
      items.sort(
        (a, b) =>
          a.userName.localeCompare(b.userName, 'ja') ||
          (a.mode === b.mode ? 0 : a.mode === 'drill' ? -1 : 1) ||
          a.contentName.localeCompare(b.contentName, 'ja')
      )
    );
    return { groups: byDate, sortedDates: [...byDate.keys()].sort((a, b) => b.localeCompare(a)), totalItems: map.size };
  }, [initialData]);

  const totalPages = Math.ceil(sortedDates.length / MONITOR_DAYS_PER_PAGE);
  const pagedDates = sortedDates.slice((page - 1) * MONITOR_DAYS_PER_PAGE, page * MONITOR_DAYS_PER_PAGE);

  const applyFilters = (patch: Partial<MonitorQuery>) => {
    setPage(1);
    navigate(patch);
  };

  const handleExportCSV = () => {
    const rows = sortedDates.flatMap((date) =>
      (groups.get(date) ?? []).map((item) => [
        toDayLabel(date),
        item.userName,
        SPRINT_MODE_LABEL[item.mode],
        item.contentName,
        item.sprintCount ?? '-',
        item.answeredCount,
        item.assessmentCount,
      ])
    );

    logClientEvent({
      service: 'student',
      event: 'monitor:sprint_history_csv_exported',
      level: 'info',
      message: `Sprint history CSV exported: ${startDate}~${endDate}`,
      payload: { startDate, endDate, targetUserIds: userIds, rowCount: rows.length },
    }).catch(() => {});

    downloadCsv(
      `blueprint_sprint_drill_history_${startDate}_to_${endDate}${includeMonitor ? '_with_monitor' : ''}.csv`,
      ['日付', '受講生名', 'モード', '教材名', 'タイムアタック回数', '回答数', '発話数'],
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
        exportDisabled={totalItems === 0}
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
            const items = groups.get(date) ?? [];
            const sprintCount = items.reduce((acc, i) => acc + (i.sprintCount ?? 0), 0);
            const drillCount = items.filter((i) => i.mode === 'drill').length;
            const answeredCount = items.reduce((acc, i) => acc + i.answeredCount, 0);
            const assessmentCount = items.reduce((acc, i) => acc + i.assessmentCount, 0);

            return (
              <MonitorDayCard
                key={date}
                date={date}
                metrics={
                  <>
                    {sprintCount > 0 && <HistoryMetric metric="sprint" label={SPRINT_MODE_LABEL.sprint} value={sprintCount} />}
                    {drillCount > 0 && <HistoryMetric metric="drill" label={SPRINT_MODE_LABEL.drill} value={drillCount} />}
                    <HistoryMetric icon={CheckCircle2} label="回答" value={answeredCount} />
                    <HistoryMetric metric="speech" label="発話" value={assessmentCount} />
                  </>
                }
              >
                {items.map((item) => (
                  <MonitorDayRow
                    key={item.key}
                    user={<MonitorUserName name={item.userName} isMonitor={monitorIds.has(item.userId)} />}
                    content={
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
                          <TrainingMetricIcon metric={item.mode} size={12} />
                          {SPRINT_MODE_LABEL[item.mode]}
                        </span>
                        <span className="truncate text-ink-soft" title={item.contentName}>
                          {item.contentName}
                        </span>
                      </span>
                    }
                    metrics={
                      <>
                        {item.sprintCount !== null && <HistoryMetric metric="sprint" label="回数" value={item.sprintCount} />}
                        <HistoryMetric icon={CheckCircle2} label="回答" value={item.answeredCount} />
                        <HistoryMetric metric="speech" label="発話" value={item.assessmentCount} />
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
