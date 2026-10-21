import { SectionLoadError } from '@gabby/lib/components/common/SectionLoadError';
import { currentReportingMonth } from '@gabby/lib/date/reporting';
import { getMonitorSprintHistory, getMonitorUserList, getMonitorWordHistory } from '@/actions/monitorAction';
import { LOAD_ERROR_MESSAGE, RELOAD_LABEL } from '@/constants/network';
import { MonitorHeader } from './_components/MonitorHeader';
import { getMonthRange, parseMonitorView, type MonitorQuery } from './_components/monitorQuery';
import { MonitorSprintHistoryView } from './_components/MonitorSprintHistoryView';
import { MonitorUserList } from './_components/MonitorUserList';
import { MonitorWordHistoryView } from './_components/MonitorWordHistoryView';

export const dynamic = 'force-dynamic';

interface MonitorPageProps {
  searchParams: Promise<{
    view?: string;
    userIds?: string;
    startDate?: string;
    endDate?: string;
    includeMonitor?: string;
  }>;
}

export default async function MonitorPage({ searchParams }: MonitorPageProps) {
  const params = await searchParams;

  // 期間の指定が無い場合は当月（月初〜月末）。期間は集計期間のタイムゾーン（日本時間）で区切る
  const thisMonth = getMonthRange(currentReportingMonth());
  const query: MonitorQuery & { startDate: string; endDate: string } = {
    view: parseMonitorView(params.view),
    startDate: params.startDate || thisMonth.startDate,
    endDate: params.endDate || thisMonth.endDate,
    userIds: params.userIds ? params.userIds.split(',') : [],
    includeMonitor: params.includeMonitor === 'true',
  };
  const { startDate, endDate, userIds, includeMonitor } = query;
  const filterUserIds = userIds && userIds.length > 0 ? userIds : undefined;

  // 対象期間(start/end)を渡し、「その期間に有効な契約を持っていた生徒」を一覧・絞り込み候補の対象にする
  const [userListResult, wordHistoryResult, sprintHistoryResult] = await Promise.all([
    getMonitorUserList(startDate, endDate, includeMonitor),
    getMonitorWordHistory(startDate, endDate, filterUserIds, includeMonitor),
    getMonitorSprintHistory(startDate, endDate, filterUserIds, includeMonitor),
  ]);

  // 取得の失敗は各アクションでログに残す。「該当する受講生がいない」と見分けがつくよう、空の一覧ではなく読み込みの失敗として出す
  if (!userListResult.success || !wordHistoryResult.success || !sprintHistoryResult.success) {
    return (
      <>
        <MonitorHeader query={query} />
        <SectionLoadError message={LOAD_ERROR_MESSAGE} retryLabel={RELOAD_LABEL} />
      </>
    );
  }
  const users = userListResult.data;
  const wordHistory = wordHistoryResult.data;
  const sprintHistory = sprintHistoryResult.data;

  return (
    <>
      <MonitorHeader query={query} />

      {query.view === 'overview' && (
        <MonitorUserList users={users} wordHistory={wordHistory} sprintHistory={sprintHistory} query={query} />
      )}
      {query.view === 'word' && <MonitorWordHistoryView initialData={wordHistory} users={users} query={query} />}
      {query.view === 'sprint' && <MonitorSprintHistoryView initialData={sprintHistory} users={users} query={query} />}
    </>
  );
}
