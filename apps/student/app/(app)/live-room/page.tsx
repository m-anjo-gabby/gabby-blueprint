import { getMySessions } from '@/actions/sessionAction';
import { SESSION_STATUS } from '@gabby/types/session';
import { SessionPicker } from './_components/SessionPicker';

export default async function LiveSessionSessionPickerPage() {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const sessions = await getMySessions(rangeStart.toISOString(), rangeEnd.toISOString());

  // サーバー時刻(now)を基準に、終了予定時刻を過ぎたセッションは一覧から除外する
  // （このページはサーバーコンポーネントのため、nowはリクエスト処理時のサーバー時刻）。
  const joinableSessions = sessions
    .filter((s) => s.status === SESSION_STATUS.SCHEDULED && new Date(s.end_datetime).getTime() > now.getTime())
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  return <SessionPicker sessions={joinableSessions} />;
}
