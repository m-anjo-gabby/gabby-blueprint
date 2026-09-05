'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarClock, ChevronLeft, FileText, Loader2, RotateCcw, Ticket, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { getMyPastSessions } from '@/actions/sessionAction';
import { SESSION_STATUS, SessionListItem } from '@gabby/types/session';
import { BookableTicketSlot, LiveSessionContractSummary } from '@gabby/types/matching';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { SessionActionDialog, SessionActionTarget } from '../../calendar/_components/SessionActionDialog';
import { BookMakeupSessionDialog } from '../../calendar/_components/BookMakeupSessionDialog';

const JOINABLE_WINDOW_MS = 48 * 60 * 60 * 1000;
// 結果画面への導線を出す(=call_logが記録されている想定の)確定ステータス
const RESULT_LINKABLE_STATUSES = new Set<number>([SESSION_STATUS.COMPLETED, SESSION_STATUS.NO_SHOW, SESSION_STATUS.EARLY_ENDED]);
const CHANGE_HISTORY_STATUSES = new Set<number>([SESSION_STATUS.CANCELLED_BY_STUDENT, SESSION_STATUS.CANCELLED_BY_COACH, SESSION_STATUS.RESCHEDULED]);

function isJoinableSoon(startDatetime: string): boolean {
  return new Date(startDatetime).getTime() - Date.now() <= JOINABLE_WINDOW_MS;
}

function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).format(new Date(iso));
}

interface Props {
  contracts: LiveSessionContractSummary[];
  initialTicketId: string | null;
  upcomingSessions: SessionListItem[];
  initialPastSessions: SessionListItem[];
  bookableSlots: BookableTicketSlot[];
}

export function LiveSessionHub({ contracts, initialTicketId, upcomingSessions: initialUpcoming, initialPastSessions, bookableSlots }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const router = useRouter();
  const [upcomingSessions, setUpcomingSessions] = useState(initialUpcoming);
  const [selectedTicketId, setSelectedTicketId] = useState(initialTicketId);
  const [pastSessionsByTicket, setPastSessionsByTicket] = useState<Record<string, SessionListItem[]>>(
    initialTicketId ? { [initialTicketId]: initialPastSessions } : {}
  );
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  const [isBookMakeupOpen, setIsBookMakeupOpen] = useState(false);

  useEffect(() => {
    if (!selectedTicketId || pastSessionsByTicket[selectedTicketId]) return;
    getMyPastSessions(selectedTicketId).then((sessions) => {
      setPastSessionsByTicket((prev) => ({ ...prev, [selectedTicketId]: sessions }));
    });
  }, [selectedTicketId, pastSessionsByTicket]);

  const isCurrentSelected = contracts.find((c) => c.ticket_id === selectedTicketId)?.is_current ?? false;
  const pastSessions = selectedTicketId ? pastSessionsByTicket[selectedTicketId] : undefined;
  const isLoadingPast = selectedTicketId !== null && pastSessions === undefined;
  const completedSessions = (pastSessions ?? []).filter((s) => RESULT_LINKABLE_STATUSES.has(s.status));
  const changeHistorySessions = (pastSessions ?? []).filter((s) => CHANGE_HISTORY_STATUSES.has(s.status));

  // 今後の予定が無い契約(過去契約など)では「今後の予定」タブ自体を出さない。
  // タブが消えた際に選択中タブが宙に浮かないよう、表示用の値は都度導出する（stateにしない）
  const showUpcomingTab = isCurrentSelected && upcomingSessions.length > 0;
  const [activeTab, setActiveTab] = useState('upcoming');
  const displayedTab = activeTab === 'upcoming' && !showUpcomingTab ? 'completed' : activeTab;

  const invalidateSelectedPastSessions = () => {
    if (!selectedTicketId) return;
    setPastSessionsByTicket((prev) => {
      const next = { ...prev };
      delete next[selectedTicketId];
      return next;
    });
  };

  const handleResolved = (sessionId: string, patch: Partial<SessionListItem>) => {
    setUpcomingSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, ...patch } : s)));
    // キャンセル・振替は変更履歴タブ、返還可否は未割当チケットにも影響するため、
    // 選択中の契約の履歴キャッシュを破棄しつつサーバーの最新データも取得し直す
    invalidateSelectedPastSessions();
    router.refresh();
  };

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
          >
            <ChevronLeft size={24} />
          </Link>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">ライブセッション</h1>
        </div>

        <p className="text-[13px] text-slate-500">セッションの予定確認・予約・振替・キャンセルをここで管理できます。</p>

        {contracts.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">契約</Label>
            <select
              value={selectedTicketId ?? ''}
              onChange={(e) => setSelectedTicketId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {contracts.map((c) => (
                <option key={c.ticket_id} value={c.ticket_id}>
                  {c.is_current ? '現在の契約 ' : ''}
                  {formatContractDate(c.start_date, timezone)} 〜 {formatContractDate(c.end_date, timezone)}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 bg-slate-50/50">
        <Tabs value={displayedTab} onValueChange={setActiveTab} className="space-y-2">
          <TabsList className={cn('grid w-full', showUpcomingTab ? 'grid-cols-3' : 'grid-cols-2')}>
            {showUpcomingTab && <TabsTrigger value="upcoming">今後の予定</TabsTrigger>}
            <TabsTrigger value="completed">実施済み</TabsTrigger>
            <TabsTrigger value="history">変更履歴</TabsTrigger>
          </TabsList>

          {showUpcomingTab && (
            <TabsContent value="upcoming" className="space-y-2">
              {bookableSlots.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBookMakeupOpen(true)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 bg-indigo-50 rounded-[20px] border border-indigo-100 hover:bg-indigo-100/60 active:scale-[0.99] transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-indigo-500 shrink-0">
                    <Ticket size={16} />
                  </div>
                  <p className="text-xs font-bold text-indigo-700 flex-1 text-left">
                    未割当のチケットがあります。タップして予約できます。
                  </p>
                  <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                </button>
              )}

              {upcomingSessions.map((session) => {
                const joinable = isJoinableSoon(session.start_datetime);
                return (
                  <div
                    key={session.session_id}
                    className="flex flex-col gap-2.5 px-3.5 py-3.5 bg-white rounded-[24px] border border-slate-100 shadow-sm"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 shrink-0">
                        <Video size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">{session.counterpart_name} コーチ</p>
                        <p className="text-[13px] text-slate-500 truncate mt-0.5">
                          {formatDateTimeByZone(session.start_datetime, timezone, false)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {joinable && (
                        <Button type="button" size="sm" asChild>
                          <Link href={`/live-room/${session.session_id}`}>
                            参加する
                            <ArrowRight size={13} />
                          </Link>
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setActionTarget({ session, mode: 'reschedule' })}
                      >
                        <RotateCcw size={13} />
                        振替
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => setActionTarget({ session, mode: 'cancel' })}
                      >
                        <X size={13} />
                        キャンセル
                      </Button>
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          )}

          <TabsContent value="completed" className="space-y-2">
            {isLoadingPast ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : completedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <CalendarClock size={22} className="text-slate-300 mb-4" />
                <p className="text-sm font-bold text-slate-500">実施済みのセッションはありません</p>
              </div>
            ) : (
              completedSessions.map((session) => (
                <Link
                  key={session.session_id}
                  href={`/live-room/sessions/${session.session_id}/result`}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 bg-white rounded-[20px] border border-slate-100 shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate">{session.counterpart_name} コーチ</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatDateTimeByZone(session.start_datetime, timezone, false)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${SESSION_STATUS_BADGE[session.status].className}`}>
                      {SESSION_STATUS_BADGE[session.status].label}
                    </span>
                    <FileText size={14} className="text-slate-300" />
                  </div>
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {isLoadingPast ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : changeHistorySessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <CalendarClock size={22} className="text-slate-300 mb-4" />
                <p className="text-sm font-bold text-slate-500">変更履歴はありません</p>
              </div>
            ) : (
              changeHistorySessions.map((session) => {
                const badge = SESSION_STATUS_BADGE[session.status];
                return (
                  <div
                    key={session.session_id}
                    className="flex flex-col gap-1.5 px-3.5 py-3 bg-white rounded-[20px] border border-slate-100 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-700 truncate">{session.counterpart_name} コーチ</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatDateTimeByZone(session.start_datetime, timezone, false)}
                        </p>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    {session.cancel_reason && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">{session.cancel_reason}</p>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />

      <BookMakeupSessionDialog
        open={isBookMakeupOpen}
        slots={bookableSlots}
        onClose={() => setIsBookMakeupOpen(false)}
        onBooked={() => {
          setIsBookMakeupOpen(false);
          invalidateSelectedPastSessions();
          router.refresh();
        }}
      />
    </div>
  );
}
