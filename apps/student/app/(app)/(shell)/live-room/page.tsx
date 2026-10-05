import { getMyUpcomingSessions, getMyPastSessions, getMyRescheduleProposalGroups, getMyBookingRequests } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionOverview } from '@/actions/matchingAction';
import { getMyLiveSessionContractsCached, getNextContractMatching, pickLiveSessionContract } from '@/lib/liveSessionContracts';
import { getSessionHomework, getSessionHomeworkChecklist } from '@/actions/sessionHomeworkAction';
import { COMPLETION_RESULT, SESSION_STATUS, type SessionListItem } from '@gabby/types/session';
import type { LiveSessionOverview } from '@gabby/types/matching';
import { LiveSessionHub } from './_components/LiveSessionHub';
import { LiveSessionIntro } from './_components/LiveSessionIntro';
import type { PreviousHomeworkStatus, PreviousSessionSummary } from './_components/PreviousSessionLink';


const HOMEWORK_PREVIEW_LENGTH = 60;

/**
 * 前回のセッション（実施済みのうち最新の1件。未参加は内容・宿題が無いため除く）と、その宿題の状況を取得する。
 * 宿題は未登録・本文のみ・チェックリストありの3通りがあるため、それぞれ区別して返す
 */
async function fetchPreviousSession(pastSessions: SessionListItem[]): Promise<PreviousSessionSummary | null> {
  const session = pastSessions.find(
    (s) => s.status === SESSION_STATUS.COMPLETED && s.completion_result !== COMPLETION_RESULT.NO_SHOW
  );
  if (!session) return null;

  const [homework, checklist] = await Promise.all([
    getSessionHomework(session.session_id),
    getSessionHomeworkChecklist(session.session_id),
  ]);

  let status: PreviousHomeworkStatus;
  if (!homework) {
    status = { kind: 'none' };
  } else if (checklist.length > 0) {
    status = { kind: 'checklist', done: checklist.filter((item) => item.is_done).length, total: checklist.length };
  } else {
    const firstLine = homework.homework_text.trim().split(/\r?\n/)[0] ?? '';
    status = { kind: 'text', preview: firstLine.slice(0, HOMEWORK_PREVIEW_LENGTH) };
  }
  return { session, homework: status };
}

export default async function LiveSessionHubPage({ searchParams }: { searchParams: Promise<{ contract?: string }> }) {
  const { contract: requestedTicketId } = await searchParams;

  // 契約単位のデータ（履歴・回数の内訳）は選択中の契約に依存するため、契約一覧の取得直後に開始し、他の取得と並行させる
  // 契約一覧は (app)/layout.tsx と同じ取得を使う（1リクエスト内で1回）
  const contractsPromise = getMyLiveSessionContractsCached();
  // 前回のセッション（次回に向けた振り返り用）は現在の契約を表示している時だけ取得する
  const contractDataPromise = contractsPromise.then(
    async (contracts): Promise<[SessionListItem[], LiveSessionOverview | null, PreviousSessionSummary | null]> => {
      const selected = pickLiveSessionContract(contracts, requestedTicketId);
      if (!selected) return [[], null, null];
      const [past, overview] = await Promise.all([getMyPastSessions(selected.ticket_id), getMyLiveSessionOverview(selected.ticket_id)]);
      const previous = selected.is_current ? await fetchPreviousSession(past) : null;
      return [past, overview, previous];
    }
  );

  // 現在の契約を表示している時は、次の契約（継続用）の専属コーチの選択状況も取得する（未選択なら案内する）
  const nextMatchingPromise = contractsPromise.then((contracts) =>
    pickLiveSessionContract(contracts, requestedTicketId)?.is_current ? getNextContractMatching(contracts) : null
  );

  const [contracts, [pastSessions, overview, previousSession], nextContractMatching, upcomingSessions, bookableSlots, proposalGroups, bookingRequests] = await Promise.all([
    contractsPromise,
    contractDataPromise,
    nextMatchingPromise,
    getMyUpcomingSessions(),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyBookingRequests(),
  ]);

  // ライブセッション付き契約を一度も持ったことがない（アプリのみ契約）場合は紹介画面を表示する。
  // 過去に契約があった利用者は、履歴を確認できるようハブを表示する
  const selectedContract = pickLiveSessionContract(contracts, requestedTicketId);
  if (!selectedContract) {
    return <LiveSessionIntro />;
  }

  return (
    <LiveSessionHub
      contracts={contracts}
      selectedContract={selectedContract}
      overview={overview}
      nextContractMatching={nextContractMatching}
      previousSession={previousSession}
      upcomingSessions={upcomingSessions}
      pastSessions={pastSessions}
      bookableSlots={bookableSlots}
      proposalGroups={proposalGroups}
      bookingRequests={bookingRequests}
    />
  );
}
