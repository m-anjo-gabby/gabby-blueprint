'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Ticket, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LiveContractSelect, formatContractPeriod } from '@/components/session/LiveContractSelect';
import { CountBadge, ShellSectionTitle } from '@/components/shell/ShellPage';
import { LiveRoomPageHeader } from './LiveRoomSkeleton';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { withdrawSessionBookingRequest } from '@/actions/sessionAction';
import {
  MyBookingRequestItem,
  MyRescheduleProposalGroup,
  SessionListItem,
  SESSION_RESULT_STATUSES,
  isSelfInitiatedCancel,
} from '@gabby/types/session';
import { BookableTicketSlot, LiveSessionContractSummary, LiveSessionOverview, NextContractMatching } from '@gabby/types/matching';
import { SessionActionDialog, SessionActionTarget } from '../../calendar/_components/SessionActionDialog';
import { BookMakeupSessionDialog } from '../../calendar/_components/BookMakeupSessionDialog';
import { RescheduleProposalCard } from './RescheduleProposalCard';
import { NextSessionPanel } from './NextSessionPanel';
import { ContractOverviewCard } from './ContractOverviewCard';
import { UpcomingSessionList } from './UpcomingSessionList';
import { SessionHistoryList } from './SessionHistoryList';
import { PreviousSessionLink, PreviousSessionSummary } from './PreviousSessionLink';

// 履歴に出すのは、結果画面へ進める実施済みと、生徒・コーチ本人起因のキャンセルのみ
// （ライセンス無効化・コーチ交代等の運用都合のキャンセルは表示しない。isSelfInitiatedCancel参照）
const RESULT_LINKABLE_STATUSES = new Set<number>(SESSION_RESULT_STATUSES);

/** 「対応が必要」欄の1行（アイコン・説明・操作ボタン） */
function ActionNotice({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-brand-100 bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-500">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>
        </div>
      </div>
      <div className="shrink-0 sm:ml-auto">{action}</div>
    </section>
  );
}

interface Props {
  contracts: LiveSessionContractSummary[];
  selectedContract: LiveSessionContractSummary;
  overview: LiveSessionOverview | null;
  /** 現在の契約を表示中のときの、次の契約（継続用）の専属コーチの選択状況 */
  nextContractMatching: NextContractMatching | null;
  previousSession: PreviousSessionSummary | null;
  upcomingSessions: SessionListItem[];
  pastSessions: SessionListItem[];
  bookableSlots: BookableTicketSlot[];
  /** コーチから届いた振替候補（生徒が応答する） */
  proposalGroups: MyRescheduleProposalGroup[];
  /** 生徒がキャンセル時に提案し、コーチの回答待ちの振替候補 */
  proposedGroups: MyRescheduleProposalGroup[];
  bookingRequests: MyBookingRequestItem[];
}

/**
 * ライブセッション・ホーム。優先度の高い順に1本のスクロールで並べる:
 * ①対応が必要（振替候補・コーチ未選択・未予約） ②次回のセッション（＋前回の結果への導線） ③契約の状況 ④今後の予定 ⑤履歴。
 * データはすべてサーバーから受け取り、操作後は router.refresh() で取り直す（契約の切替はURLの ?contract=）。
 */
export function LiveSessionHub({
  contracts,
  selectedContract,
  overview,
  nextContractMatching,
  previousSession,
  upcomingSessions,
  pastSessions,
  bookableSlots,
  proposalGroups,
  proposedGroups,
  bookingRequests,
}: Props) {
  const timezone = useTimezone();
  const router = useRouter();
  const { showToast } = useToast();
  const [isRefreshing, startRefresh] = useTransition();
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  // 振替候補を見送った後は、取り直した予約できるコマで予約リクエストダイアログを開く
  // （見送るまでは候補の回答待ちがその回を使っているため、見送る前のデータでは予約できるコマが無い）
  const [isBookingAfterDecline, setIsBookingAfterDecline] = useState(false);
  const [withdrawingRequestId, setWithdrawingRequestId] = useState<string | null>(null);

  const refresh = () => startRefresh(() => router.refresh());

  const isCurrent = selectedContract.is_current;
  const historySessions = pastSessions.filter((s) => RESULT_LINKABLE_STATUSES.has(s.status) || isSelfInitiatedCancel(s));
  const [nextSession, ...laterSessions] = isCurrent ? upcomingSessions : [];

  // 未予約の回のうち、予約リクエスト・振替候補（届いた候補・自分が提案した候補）の回答待ちになっている分は「調整中」として差し引く
  const adjustingCount = isCurrent ? bookingRequests.length + proposalGroups.length + proposedGroups.length : 0;
  const unbookedCount = isCurrent && overview ? Math.max(overview.unbooked_count - adjustingCount, 0) : 0;
  // 専属コーチの未選択は、表示中の契約が有効（現在の契約、または開始前の契約）なら案内する
  const unmatchedSlotCount = selectedContract.is_active && overview ? overview.slots.filter((s) => s.status === 'unmatched').length : 0;
  // 現在の契約の選択が済んでいれば、次の契約（継続用）の選択を促す
  const nextUnmatched = isCurrent && unmatchedSlotCount === 0 && nextContractMatching && nextContractMatching.unmatchedCount > 0 ? nextContractMatching : null;
  const showBookingNotice = unbookedCount > 0 && bookableSlots.length > 0;
  const bookingDialogOpen = isBookingOpen || (isBookingAfterDecline && !isRefreshing && bookableSlots.length > 0);
  const closeBookingDialog = () => {
    setIsBookingOpen(false);
    setIsBookingAfterDecline(false);
  };
  const actionCount =
    (isCurrent ? proposalGroups.length + (showBookingNotice ? 1 : 0) : 0) + (unmatchedSlotCount > 0 ? 1 : 0) + (nextUnmatched ? 1 : 0);
  const hasActions = actionCount > 0;

  const handleContractChange = (ticketId: string) => {
    startRefresh(() => router.replace(`/live-room?contract=${ticketId}`, { scroll: false }));
  };

  const handleWithdrawRequest = async (requestId: string) => {
    setWithdrawingRequestId(requestId);
    try {
      const result = await withdrawSessionBookingRequest(requestId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('予約リクエストを取り下げました。', 'success');
      refresh();
    } finally {
      setWithdrawingRequestId(null);
    }
  };

  return (
    <>
      <LiveRoomPageHeader />

      {contracts.length > 1 && (
        <div className="mb-5">
          <LiveContractSelect contracts={contracts} selectedTicketId={selectedContract.ticket_id} onChange={handleContractChange} />
        </div>
      )}

      <div className={cn('space-y-8 transition-opacity', isRefreshing && 'pointer-events-none opacity-60')} aria-busy={isRefreshing}>
        {hasActions && (
          <div>
            <ShellSectionTitle aside={<CountBadge count={actionCount} />}>対応が必要です</ShellSectionTitle>
            <div className="space-y-3">
              {proposalGroups.map((group) => (
                <RescheduleProposalCard
                  key={group.session_id}
                  group={group}
                  timezone={timezone}
                  onAccepted={refresh}
                  onDeclined={() => {
                    refresh();
                    setIsBookingAfterDecline(true);
                  }}
                />
              ))}
              {unmatchedSlotCount > 0 && overview && (
                <ActionNotice
                  icon={Users}
                  title={
                    overview.weekly_frequency > 1
                      ? `週${overview.weekly_frequency}回のうち${unmatchedSlotCount}コマの専属コーチが未選択です`
                      : '専属コーチが未選択です'
                  }
                  description={`コーチを選ぶと、そのコマのセッション（${overview.unassigned_count}回分）が毎週の日時で自動的に予約されます。`}
                  action={
                    <Button asChild className="w-full sm:w-auto">
                      <Link href={`/coach-matching?contract=${selectedContract.ticket_id}`}>
                        コーチを選ぶ
                        <ChevronRight size={16} />
                      </Link>
                    </Button>
                  }
                />
              )}
              {nextUnmatched && (
                <ActionNotice
                  icon={Users}
                  title={
                    nextUnmatched.slotCount > 1
                      ? `次の契約の週${nextUnmatched.slotCount}回のうち${nextUnmatched.unmatchedCount}コマの専属コーチが未選択です`
                      : '次の契約の専属コーチが未選択です'
                  }
                  description={`次の契約（${formatContractPeriod(nextUnmatched.contract, timezone)}）も、コーチを選ぶとその期間のセッションが毎週の日時で自動的に予約されます。`}
                  action={
                    <Button asChild className="w-full sm:w-auto">
                      <Link href={`/coach-matching?contract=${nextUnmatched.contract.ticket_id}`}>
                        コーチを選ぶ
                        <ChevronRight size={16} />
                      </Link>
                    </Button>
                  }
                />
              )}
              {showBookingNotice && (
                <ActionNotice
                  icon={Ticket}
                  title={`日時が決まっていないセッションが${unbookedCount}回あります`}
                  description="ご希望の日時をコーチにリクエストすると、承認後に予約が確定します。"
                  action={
                    <Button type="button" className="w-full sm:w-auto" onClick={() => setIsBookingOpen(true)}>
                      日時をリクエスト
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        )}

        {nextSession ? (
          <NextSessionPanel
            session={nextSession}
            timezone={timezone}
            previous={previousSession}
            onCancel={() => setActionTarget({ session: nextSession, mode: 'cancel' })}
          />
        ) : (
          previousSession && (
            <div>
              <ShellSectionTitle>前回のセッション</ShellSectionTitle>
              <PreviousSessionLink previous={previousSession} timezone={timezone} variant="card" />
            </div>
          )
        )}

        {overview && (
          <ContractOverviewCard contract={selectedContract} overview={overview} timezone={timezone} adjustingCount={adjustingCount} />
        )}

        {isCurrent && (laterSessions.length > 0 || bookingRequests.length > 0 || proposedGroups.length > 0) && (
          <div>
            <ShellSectionTitle>今後の予定</ShellSectionTitle>
            <UpcomingSessionList
              sessions={laterSessions}
              requests={bookingRequests}
              proposals={proposedGroups}
              timezone={timezone}
              withdrawingRequestId={withdrawingRequestId}
              onCancelSession={(session) => setActionTarget({ session, mode: 'cancel' })}
              onWithdrawRequest={handleWithdrawRequest}
            />
          </div>
        )}

        {isCurrent && !nextSession && bookingRequests.length === 0 && proposedGroups.length === 0 && !hasActions && (
          <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
            予定されているセッションはありません
          </p>
        )}

        <SessionHistoryList key={selectedContract.ticket_id} sessions={historySessions} timezone={timezone} />
      </div>

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={refresh} />

      <BookMakeupSessionDialog
        open={bookingDialogOpen}
        slots={bookableSlots}
        onClose={closeBookingDialog}
        onRequested={() => {
          closeBookingDialog();
          refresh();
        }}
      />
    </>
  );
}
