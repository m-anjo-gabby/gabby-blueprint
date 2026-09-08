'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle2, ChevronRight, Loader2, TriangleAlert, User, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import {
  SESSION_STATUS,
  SessionListItem,
  SESSION_NON_ACTIONABLE_STATUSES,
  SESSION_RESULT_STATUSES,
  SESSION_CHANGE_HISTORY_STATUSES,
} from '@gabby/types/session';
import type { CoachSessionListItem, LiveSessionShortfallItem, StudentLiveSessionContractSummary } from '@gabby/types/coachStudent';
import { getStudentSessionsByTicket } from '@/actions/studentAction';
import { SessionActionDialog, SessionActionTarget } from '../../../calendar/_components/SessionActionDialog';

function toSessionListItem(session: CoachSessionListItem, studentId: string, studentName: string): SessionListItem {
  return {
    session_id: session.session_id,
    schedule_id: session.schedule_id,
    start_datetime: session.start_datetime,
    end_datetime: session.end_datetime,
    status: session.status,
    viewer_role: 'coach',
    counterpart_id: studentId,
    counterpart_name: studentName,
    rescheduled_from: session.rescheduled_from,
    cancel_reason: session.cancel_reason,
    status_note: session.status_note,
  };
}

function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: timezone }).format(new Date(iso));
}

interface Props {
  studentId: string;
  studentName: string;
  contracts: StudentLiveSessionContractSummary[];
  initialTicketId: string | null;
  initialSessions: CoachSessionListItem[];
  shortfalls: LiveSessionShortfallItem[];
}

export function LiveSessionHistoryCard({ studentId, studentName, contracts, initialTicketId, initialSessions, shortfalls }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const myId = useUserStore((state) => state.user?.id);
  const router = useRouter();
  const [selectedTicketId, setSelectedTicketId] = useState(initialTicketId);
  const [sessionsByTicket, setSessionsByTicket] = useState<Record<string, CoachSessionListItem[]>>(
    initialTicketId ? { [initialTicketId]: initialSessions } : {}
  );
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);

  useEffect(() => {
    if (!selectedTicketId || sessionsByTicket[selectedTicketId]) return;
    getStudentSessionsByTicket(studentId, selectedTicketId).then((sessions) => {
      setSessionsByTicket((prev) => ({ ...prev, [selectedTicketId]: sessions }));
    });
  }, [selectedTicketId, sessionsByTicket, studentId]);

  const sessions = selectedTicketId ? sessionsByTicket[selectedTicketId] : undefined;
  const isLoading = selectedTicketId !== null && sessions === undefined;

  // 担当外セッション（別コーチが担当）は、実施予定・実施結果があるものだけを参照可能にし、
  // キャンセル・振替等の管理系ステータスは表示しない（参照価値が無いため）
  const visibleSessions = (sessions ?? []).filter(
    (s) => s.coach_id === myId || !SESSION_NON_ACTIONABLE_STATUSES.includes(s.status)
  );
  const now = new Date();
  const upcomingSessions = visibleSessions.filter(
    (s) => s.status === SESSION_STATUS.SCHEDULED && new Date(s.end_datetime) > now
  );
  const completedSessions = visibleSessions.filter((s) => SESSION_RESULT_STATUSES.includes(s.status));
  // change-historyのステータス群はすべてSESSION_NON_ACTIONABLE_STATUSESの部分集合のため、
  // visibleSessionsに残っている時点で必ず自分自身が担当したセッションである
  const historySessions = visibleSessions.filter((s) => SESSION_CHANGE_HISTORY_STATUSES.includes(s.status));

  const showUpcomingTab = upcomingSessions.length > 0;
  const [activeTab, setActiveTab] = useState('upcoming');
  const displayedTab = activeTab === 'upcoming' && !showUpcomingTab ? 'completed' : activeTab;

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
    const badge = SESSION_STATUS_BADGE[session.status];
    const isOwn = session.coach_id === myId;
    const isFuture = new Date(session.start_datetime) > now;
    const isPastEnd = new Date(session.end_datetime) < now;
    const canAct = isOwn && session.status === SESSION_STATUS.SCHEDULED && isFuture;
    const canResolve = isOwn && session.status === SESSION_STATUS.SCHEDULED && isPastEnd;
    // キャンセル・振替済み（Changesタブ対象）は実施されていないため、Hub/結果画面への
    // 導線を出さない（押しても実質何も無い画面に遷移してしまうため）
    const isLinkable = isOwn && !SESSION_NON_ACTIONABLE_STATUSES.includes(session.status);
    const href = session.status === SESSION_STATUS.SCHEDULED
      ? `/students/${studentId}/sessions/${session.session_id}`
      : `/students/${studentId}/sessions/${session.session_id}/result`;

    const content = (
      <div className="flex items-center justify-between gap-3 -m-1 p-1 rounded-lg transition-colors">
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
    );

    return (
      <li
        key={session.session_id}
        className="flex flex-col gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60"
      >
        {isLinkable ? (
          <Link href={href} className="hover:bg-slate-100/80 -m-1 p-1 rounded-lg transition-colors">
            {content}
          </Link>
        ) : (
          content
        )}
        {canAct && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
              onClick={() => setActionTarget({ session: toSessionListItem(session, studentId, studentName), mode: 'cancel' })}
            >
              <X size={13} />
              Cancel
            </Button>
          </div>
        )}
        {canResolve && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-amber-700 border-amber-200 hover:bg-amber-50"
              onClick={() => setActionTarget({ session: toSessionListItem(session, studentId, studentName), mode: 'resolve' })}
            >
              <CheckCircle2 size={13} />
              Resolve
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 space-y-3">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Video size={14} className="text-indigo-500" />
          Live Sessions
        </CardTitle>
        {contracts.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-[10px] text-slate-400">Contract</Label>
            <select
              value={selectedTicketId ?? ''}
              onChange={(e) => setSelectedTicketId(e.target.value)}
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
            {/* 予約・振替の決定権は生徒側にあるため、コーチ側では「未消化枠がある」ことの
                通知のみとし、Bookボタン（book_makeup_sessionの直接呼び出し）は置かない */}
            <ul className="space-y-1.5 pl-5.5">
              {shortfalls.map((s) => (
                <li key={s.schedule_id} className="text-[11px] font-semibold text-amber-700">
                  {DAY_OF_WEEK_SHORT_LABEL_EN[s.day_of_week as DayOfWeek]} {s.start_time.slice(0, 5)}: only {s.actual_sessions} of {s.expected_sessions} sessions scheduled ({s.shortfall} short). The student can book a makeup session.
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
            <TabsList className={showUpcomingTab ? 'grid w-full grid-cols-3' : 'grid w-full grid-cols-2'}>
              {showUpcomingTab && <TabsTrigger value="upcoming">Upcoming</TabsTrigger>}
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="history">Changes</TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : (
              <>
                {showUpcomingTab && (
                  <TabsContent value="upcoming">
                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                      {upcomingSessions.map(renderSessionRow)}
                    </ul>
                  </TabsContent>
                )}

                <TabsContent value="completed">
                  {completedSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <CalendarClock size={22} className="text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">No completed sessions yet</p>
                    </div>
                  ) : (
                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                      {completedSessions.map(renderSessionRow)}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="history">
                  {historySessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <CalendarClock size={22} className="text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">No changes yet</p>
                    </div>
                  ) : (
                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                      {historySessions.map(renderSessionRow)}
                    </ul>
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
