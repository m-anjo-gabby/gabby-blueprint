import { getGroupSessionList } from '@/actions/calendarEventAction';
import { createRenderId } from '@gabby/lib/navigation/renderId';
import { GroupSessionsView } from './_components/GroupSessionsView';

/**
 * グループセッションの一覧（全プランの生徒。ホームのグループセッションのカード・イベントの詳細から開く）。
 * これからの回と、参加登録した過去の回をサーバーでまとめて取得し、タブの切り替えでは取り直さない。
 */
export default async function GroupSessionsPage() {
  const { upcoming, past } = await getGroupSessionList();
  return <GroupSessionsView upcoming={upcoming} past={past} renderId={createRenderId()} />;
}
