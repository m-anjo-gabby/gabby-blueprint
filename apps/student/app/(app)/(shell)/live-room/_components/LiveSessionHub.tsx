'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronRight, Ticket, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShellPageHeader, ShellSectionTitle } from '@/components/shell/ShellPage';
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
import { BookableTicketSlot, LiveSessionContractSummary, LiveSessionOverview } from '@gabby/types/matching';
import { SessionActionDialog, SessionActionTarget } from '../../calendar/_components/SessionActionDialog';
import { BookMakeupSessionDialog } from '../../calendar/_components/BookMakeupSessionDialog';
import { RescheduleProposalCard } from './RescheduleProposalCard';
import { NextSessionPanel } from './NextSessionPanel';
import { ContractOverviewCard } from './ContractOverviewCard';
import { UpcomingSessionList } from './UpcomingSessionList';
import { SessionHistoryList } from './SessionHistoryList';

// 履歴に出すのは、結果画面へ進める実施済みと、生徒・コーチ本人起因のキャンセルのみ
// （ライセンス無効化・コーチ交代等の運用都合のキャンセルは表示しない。isSelfInitiatedCancel参照）
const RESULT_LINKABLE_STATUSES = new Set<number>(SESSION_RESULT_STATUSES);

function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timezone }).format(new Date(iso));
}

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
  upcomingSessions: SessionListItem[];
  pastSessions: SessionListItem[];
  bookableSlots: BookableTicketSlot[];
  proposalGroups: MyRescheduleProposalGroup[];
  bookingRequests: MyBookingRequestItem[];
}

/**
 * ライブセッション・ホーム。優先度の高い順に1本のスクロールで並べる:
 * ①対応が必要（振替候補・コーチ未選択・未予約） ②次回のセッション ③契約の状況 ④今後の予定 ⑤履歴。
 * データはすべてサーバーから受け取り、操作後は router.refresh() で取り直す（契約の切替はURLの ?contract=）。
 */
export function LiveSessionHub({
  contracts,
  selectedContract,
  overview,
  upcomingSessions,
  pastSessions,
  bookableSlots,
  proposalGroups,
  bookingRequests,
}: Props) {
  const timezone = useTimezone();
  const router = useRouter();
  const { showToast } = useToast();
  const [isRefreshing, startRefresh] = useTransition();
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [withdrawingRequestId, setWithdrawingRequestId] = useState<string | null>(null);

  const refresh = () => startRefresh(() => router.refresh());

  const isCurrent = selectedContract.is_current;
  const historySessions = pastSessions.filter((s) => RESULT_LINKABLE_STATUSES.has(s.status) || isSelfInitiatedCancel(s));
  const [nextSession, ...laterSessions] = isCurrent ? upcomingSessions : [];

  // 未予約の回のうち、予約リクエスト・振替候補の回答待ちになっている分は「調整中」として差し引く
  const adjustingCount = isCurrent ? bookingRequests.length + proposalGroups.length : 0;
  const unbookedCount = isCurrent && overview ? Math.max(overview.unbooked_count - adjustingCount, 0) : 0;
  const unmatchedSlotCount = isCurrent && overview ? overview.slots.filter((s) => s.status === 'unmatched').length : 0;
  const showBookingNotice = unbookedCount > 0 && bookableSlots.length > 0;
  const hasActions = isCurrent && (proposalGroups.length > 0 || unmatchedSlotCount > 0 || showBookingNotice);

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
      <ShellPageHeader
        title="ライブセッション"
        aside={
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/calendar">
              <CalendarDays size={15} className="text-brand" />
              カレンダー
            </Link>
          </Button>
        }
      />

      {contracts.length > 1 && (
        <div className="mb-5">
          <Select value={selectedContract.ticket_id} onValueChange={handleContractChange}>
            <SelectTrigger className="h-10 w-full rounded-control border-line bg-surface text-sm sm:w-80" aria-label="表示する契約">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contracts.map((c) => (
                <SelectItem key={c.ticket_id} value={c.ticket_id}>
                  {c.is_current ? '現在の契約：' : ''}
                  {formatContractDate(c.start_date, timezone)}〜{formatContractDate(c.end_date, timezone)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className={cn('space-y-8 transition-opacity', isRefreshing && 'pointer-events-none opacity-60')} aria-busy={isRefreshing}>
        {hasActions && (
          <div>
            <ShellSectionTitle>対応が必要です</ShellSectionTitle>
            <div className="space-y-3">
              {proposalGroups.map((group) => (
                <RescheduleProposalCard
                  key={group.session_id}
                  group={group}
                  timezone={timezone}
                  onAccepted={refresh}
                  onDeclined={() => {
                    refresh();
                    if (bookableSlots.length > 0) setIsBookingOpen(true);
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
                      <Link href="/coach-matching">
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
                  description="キャンセル等で空いた回です。ご希望の日時をコーチにリクエストしてください。"
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

        {nextSession && (
          <NextSessionPanel
            session={nextSession}
            timezone={timezone}
            onCancel={() => setActionTarget({ session: nextSession, mode: 'cancel' })}
          />
        )}

        {overview && (
          <ContractOverviewCard contract={selectedContract} overview={overview} timezone={timezone} adjustingCount={adjustingCount} />
        )}

        {isCurrent && (laterSessions.length > 0 || bookingRequests.length > 0) && (
          <div>
            <ShellSectionTitle>今後の予定</ShellSectionTitle>
            <UpcomingSessionList
              sessions={laterSessions}
              requests={bookingRequests}
              timezone={timezone}
              withdrawingRequestId={withdrawingRequestId}
              onCancelSession={(session) => setActionTarget({ session, mode: 'cancel' })}
              onWithdrawRequest={handleWithdrawRequest}
            />
          </div>
        )}

        {isCurrent && !nextSession && bookingRequests.length === 0 && !hasActions && (
          <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
            予定されているセッションはありません
          </p>
        )}

        <div>
          <ShellSectionTitle>履歴</ShellSectionTitle>
          <SessionHistoryList key={selectedContract.ticket_id} sessions={historySessions} timezone={timezone} />
        </div>
      </div>

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={refresh} />

      <BookMakeupSessionDialog
        open={isBookingOpen}
        slots={bookableSlots}
        onClose={() => setIsBookingOpen(false)}
        onRequested={() => {
          setIsBookingOpen(false);
          refresh();
        }}
      />
    </>
  );
}
