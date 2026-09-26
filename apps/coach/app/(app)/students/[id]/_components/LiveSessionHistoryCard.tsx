'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ChevronRight, Loader2, TriangleAlert, User, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSessionStatusBadge } from '@/constants/session';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useIncrementalReveal } from '@gabby/lib/hooks/useIncrementalReveal';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import {
  SESSION_STATUS,
  SessionListItem,
  SESSION_NON_ACTIONABLE_STATUSES,
  SESSION_RESULT_STATUSES,
  isSelfInitiatedCancel,
} from '@gabby/types/session';
import type { CoachSessionListItem, LiveSessionShortfallItem, StudentLiveSessionContractSummary } from '@gabby/types/coachStudent';
import { getStudentSessionsByTicket } from '@/actions/studentAction';
import { SessionActionDialog, SessionActionTarget } from '../../../calendar/_components/SessionActionDialog';

function toSessionListItem(
  session: CoachSessionListItem,
  studentId: string,
  studentName: string,
  studentTimezone: string
): SessionListItem {
  return {
    session_id: session.session_id,
    schedule_id: session.schedule_id,
    start_datetime: session.start_datetime,
    end_datetime: session.end_datetime,
    status: session.status,
    completion_result: session.completion_result,
    cancel_category: session.cancel_category,
    viewer_role: 'coach',
    counterpart_id: studentId,
    counterpart_name: studentName,
    counterpart_timezone: studentTimezone,
    rescheduled_from: session.rescheduled_from,
    cancel_reason: session.cancel_reason,
    status_note: session.status_note,
  };
}

const HISTORY_PAGE_SIZE = 10;

function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: timezone }).format(new Date(iso));
}

interface Props {
  studentId: string;
  studentName: string;
  studentTimezone: string;
  contracts: StudentLiveSessionContractSummary[];
  initialTicketId: string | null;
  initialSessions: CoachSessionListItem[];
  shortfalls: LiveSessionShortfallItem[];
}

export function LiveSessionHistoryCard({
  studentId,
  studentName,
  studentTimezone,
  contracts,
  initialTicketId,
  initialSessions,
  shortfalls,
}: Props) {
  const timezone = useTimezone();
  const myId = useUserStore((state) => state.user?.id);
  const router = useRouter();
  const [selectedTicketId, setSelectedTicketId] = useState(initialTicketId);
  const [sessionsByTicket, setSessionsByTicket] = useState<Record<string, CoachSessionListItem[]>>(
    initialTicketId ? { [initialTicketId]: initialSessions } : {}
  );
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  // 他コーチと分担している契約(週2回等)では、デフォルトは自分の担当分のみを表示する。
  // 他コーチ担当枠は自分では操作できない（book_makeup_sessionは予約先コーチが
  // スケジュール側で固定される）ため、必要な時だけ明示的にONにする設計とする。
  const [showOtherCoach, setShowOtherCoach] = useState(false);

  useEffect(() => {
    if (!selectedTicketId || sessionsByTicket[selectedTicketId]) return;
    getStudentSessionsByTicket(studentId, selectedTicketId).then((sessions) => {
      setSessionsByTicket((prev) => ({ ...prev, [selectedTicketId]: sessions }));
    });
  }, [selectedTicketId, sessionsByTicket, studentId]);

  const sessions = selectedTicketId ? sessionsByTicket[selectedTicketId] : undefined;
  const isLoading = selectedTicketId !== null && sessions === undefined;
  const hasOtherCoachSessions = (sessions ?? []).some((s) => s.coach_id !== myId);

  // 担当外セッション（別コーチが担当）は、トグルONの時だけ、実施予定・実施結果がある
  // ものに限定して参照可能にする（キャンセル・振替等の管理系ステータスは参照価値が無いため
  // 常に除外）。デフォルト(OFF)は自分の担当分のみを表示する。
  const visibleSessions = (sessions ?? []).filter(
    (s) => s.coach_id === myId || (showOtherCoach && !SESSION_NON_ACTIONABLE_STATUSES.includes(s.status))
  );
  const now = new Date();
  // 終了予定時刻を過ぎてもEnd Session/Resolveされず残っているセッション（要対応）も、ここに
  // 含めて表示する（以前はend_datetime > nowで除外しており、その間どのタブにも出現しない
  // 抜け穴になっていた）。対応自体はこの行をクリックして遷移するSession Hubに一本化する。
  // サーバー側は履歴タブ（Completed/Changes）向けに開始日時の降順で返すが、このタブは
  // 「次に対応すべきものから」見たいため昇順に並べ替える（結果として、過去日時のまま残る
  // 未対応セッションが自動的に先頭に来る）。
  const scheduledSessions = visibleSessions
    .filter((s) => s.status === SESSION_STATUS.SCHEDULED)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  const completedSessions = visibleSessions.filter((s) => SESSION_RESULT_STATUSES.includes(s.status));
  // 変更履歴タブは生徒・コーチ本人起因のキャンセルのみを対象とする（ライセンス無効化・
  // コーチ交代・アドミン代理操作は運用都合の内部処理のため対象外）。isSelfInitiatedCancelは
  // status===CANCELLEDを前提とするため、これもSESSION_NON_ACTIONABLE_STATUSESの部分集合であり、
  // visibleSessionsに残っている時点で必ず自分自身が担当したセッションである
  const historySessions = visibleSessions.filter((s) => isSelfInitiatedCancel(s));

  const showScheduledTab = scheduledSessions.length > 0;
  const [activeTab, setActiveTab] = useState('scheduled');
  const displayedTab = activeTab === 'scheduled' && !showScheduledTab ? 'completed' : activeTab;

  // Completed・Changesは契約が長く続くほど件数が増え続けるため、最初はHISTORY_PAGE_SIZE件だけ
  // 表示し、ボタン押下で追加表示する。契約(ticket)を切り替えたら表示件数もリセットする
  const completedReveal = useIncrementalReveal(completedSessions, HISTORY_PAGE_SIZE);
  const historyReveal = useIncrementalReveal(historySessions, HISTORY_PAGE_SIZE);

  const handleTicketChange = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    completedReveal.reset();
    historyReveal.reset();
  };

  const handleToggleOtherCoach = (checked: boolean) => {
    setShowOtherCoach(checked);
    completedReveal.reset();
    historyReveal.reset();
  };

  const handleResolved = (sessionId: string, patch: Partial<SessionListItem>) => {
    if (!selectedTicketId) return;
    setSessionsByTicket((prev) => ({
      ...prev,
      [selectedTicketId]: (prev[selectedTicketId] ?? []).map((s) =>
        s.session_id === sessionId ? { ...s, ...patch } as CoachSessionListItem : s
      ),
    }));
    // キャンセルの返還可否・振替による新規行の追加はこのカードの外(shortfalls)にも影響するため、
    // サーバーの最新データで再取得する
    router.refresh();
  };

  const renderSessionRow = (session: CoachSessionListItem) => {
    const badge = getSessionStatusBadge(session);
    const isOwn = session.coach_id === myId;
    const isFuture = new Date(session.start_datetime) > now;
    const canAct = isOwn && session.status === SESSION_STATUS.SCHEDULED && isFuture;
    // バッジが「Action Needed」になる条件（getSessionStatusBadge参照）と揃える
    const needsAction = isOwn && session.status === SESSION_STATUS.SCHEDULED && new Date(session.end_datetime) < now;
    // キャンセル・振替済み（Changesタブ対象）は実施されていないため、Hub/結果画面への
    // 導線を出さない（押しても実質何も無い画面に遷移してしまうため）
    const isLinkable = isOwn && !SESSION_NON_ACTIONABLE_STATUSES.includes(session.status);
    const href = session.status === SESSION_STATUS.SCHEDULED
      ? `/students/${studentId}/sessions/${session.session_id}`
      : `/students/${studentId}/sessions/${session.session_id}/result`;

    // 行全体をタップ領域にする（以前は日時部分だけがLinkでCancelボタンの領域はタップしても
    // 反応しなかった）。<a>の中に<button>をネストするのは無効なHTMLになるため、Linkでは
    // なくli自体にonClick/onKeyDownでナビゲーションさせ、Cancelボタン側でstopPropagationして
    // 行の遷移を止める。キーボード操作（Tab+Enter/Space）にも対応する。
    const handleRowActivate = () => {
      if (isLinkable) router.push(href);
    };

    return (
      <li
        key={session.session_id}
        role={isLinkable ? 'link' : undefined}
        tabIndex={isLinkable ? 0 : undefined}
        onClick={handleRowActivate}
        onKeyDown={(e) => {
          if (isLinkable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleRowActivate();
          }
        }}
        className={cn(
          'flex flex-col gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 transition-colors',
          isLinkable && 'cursor-pointer hover:bg-slate-100/80'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-700 truncate">
              {formatDateTimeEn(session.start_datetime, timezone)}
            </span>
            {!isOwn && (
              <span className="flex items-center gap-1 shrink-0 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                <User size={10} />
                {session.coach_name}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}>
              {badge.label}
            </span>
            {isLinkable && <ChevronRight size={14} className="text-slate-300" />}
          </span>
        </div>
        {canAct && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
              onClick={(e) => {
                e.stopPropagation();
                setActionTarget({ session: toSessionListItem(session, studentId, studentName, studentTimezone), mode: 'cancel' });
              }}
            >
              <X size={13} />
              Cancel
            </Button>
          </div>
        )}
        {needsAction && <p className="text-[11px] font-semibold text-red-600 pl-1">Needs your action — tap to open the Hub.</p>}
      </li>
    );
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 space-y-3">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Video size={14} className="text-brand-500" />
          Live Sessions
        </CardTitle>
        {hasOtherCoachSessions && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="show-other-coach" className="text-[10px] font-semibold text-slate-400">
              Show sessions from other coach
            </Label>
            <Switch id="show-other-coach" checked={showOtherCoach} onCheckedChange={handleToggleOtherCoach} />
          </div>
        )}
        {contracts.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-[10px] text-slate-400">Contract</Label>
            <select
              value={selectedTicketId ?? ''}
              onChange={(e) => handleTicketChange(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-white px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {contracts.map((c) => (
                <option key={c.ticket_id} value={c.ticket_id}>
                  {c.is_current ? 'Current: ' : ''}
                  {formatContractDate(c.start_date, timezone)} – {formatContractDate(c.end_date, timezone)}
                </option>
              ))}
            </select>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-2 space-y-3">
        {shortfalls.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <TriangleAlert size={14} className="shrink-0" />
              Not all contracted sessions could be scheduled
            </div>
            {/* 新規予約はコーチの承認が必要なため、コーチ側では「未消化枠がある」ことの
                通知のみとし、Bookボタン（アドミン専用のadmin_book_session_direct同等の
                直接予約導線）は置かない。生徒がリクエストすれば申請一覧に届く */}
            <ul className="space-y-1.5 pl-5.5">
              {shortfalls.map((s) => (
                <li key={s.schedule_id} className="text-[11px] font-semibold text-amber-700">
                  {DAY_OF_WEEK_SHORT_LABEL_EN[s.day_of_week as DayOfWeek]} {s.start_time.slice(0, 5)}: only {s.actual_sessions} of {s.expected_sessions} sessions scheduled ({s.shortfall} short). The student can request a new booking.
                </li>
              ))}
            </ul>
          </div>
        )}

        {contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarClock size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No live session contracts yet</p>
          </div>
        ) : (
          <Tabs value={displayedTab} onValueChange={setActiveTab} className="space-y-2">
            <TabsList className={showScheduledTab ? 'grid w-full grid-cols-3' : 'grid w-full grid-cols-2'}>
              {showScheduledTab && <TabsTrigger value="scheduled">Scheduled</TabsTrigger>}
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="history">Changes</TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : (
              <>
                {showScheduledTab && (
                  <TabsContent value="scheduled">
                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                      {scheduledSessions.map(renderSessionRow)}
                    </ul>
                  </TabsContent>
                )}

                <TabsContent value="completed" className="space-y-2">
                  {completedSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <CalendarClock size={22} className="text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">No completed sessions yet</p>
                    </div>
                  ) : (
                    <>
                      <ul className="space-y-2 max-h-96 overflow-y-auto">
                        {completedReveal.visibleItems.map(renderSessionRow)}
                      </ul>
                      {completedReveal.hasMore && (
                        <Button type="button" size="sm" variant="outline" className="w-full" onClick={completedReveal.showMore}>
                          Show {completedReveal.remainingCount} more
                        </Button>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="history" className="space-y-2">
                  {historySessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <CalendarClock size={22} className="text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">No changes yet</p>
                    </div>
                  ) : (
                    <>
                      <ul className="space-y-2 max-h-96 overflow-y-auto">
                        {historyReveal.visibleItems.map(renderSessionRow)}
                      </ul>
                      {historyReveal.hasMore && (
                        <Button type="button" size="sm" variant="outline" className="w-full" onClick={historyReveal.showMore}>
                          Show {historyReveal.remainingCount} more
                        </Button>
                      )}
                    </>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </CardContent>

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />
    </Card>
  );
}
