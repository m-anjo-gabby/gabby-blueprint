'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, RefreshCcw, Users, Video, UserPlus, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { useToast } from '@gabby/lib/hooks/useToast';
import {
  getClientStudents,
  getStudentLiveSessionContractsForAdmin,
  getScheduleSlotsForTicket,
  getSessionsForTicket,
  releaseLessonScheduleSlot,
  getCoachesForMatching,
} from '@/actions/adminLiveSessionAction';
import { getAdminSessionStatusBadge, getAdminScheduleStatusLabel } from '@/constants/session';
import { CancelSessionDialog } from './dialogs/CancelSessionDialog';
import { BookSessionDialog } from './dialogs/BookSessionDialog';
import { MatchCoachDialog } from './dialogs/MatchCoachDialog';
import {
  SESSION_STATUS,
  SESSION_NON_ACTIONABLE_STATUSES,
  SESSION_RESULT_STATUSES,
} from '@gabby/types/session';
import type { ClientOption } from '@gabby/types/client';
import type { AdminStudentSummary, AdminScheduleSlotSummary, AdminCoachSummary, AdminContractSummary } from '@gabby/types/adminLiveSession';
import type { CoachSessionListItem } from '@gabby/types/coachStudent';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function formatContractDate(iso: string, locale: string): string {
  return format(new Date(iso), 'yyyy/MM/dd', { locale: locale === 'en' ? enUS : ja });
}

function formatSessionDateTime(iso: string, locale: string): string {
  return format(new Date(iso), 'yyyy/MM/dd (E) HH:mm', { locale: locale === 'en' ? enUS : ja });
}

interface Props {
  clients: ClientOption[];
}

export function LiveSessionManagementView({ clients }: Props) {
  const t = useTranslations('liveSessions.view');
  const tDay = useTranslations('liveSessions.day');
  const tStatus = useTranslations('liveSessions.status');
  const tScheduleStatus = useTranslations('liveSessions.scheduleStatus');
  const locale = useLocale();
  const { showToast } = useToast();

  const [selectedClientId, setSelectedClientId] = useState('');
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [contracts, setContracts] = useState<AdminContractSummary[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);

  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [slots, setSlots] = useState<AdminScheduleSlotSummary[]>([]);
  const [sessions, setSessions] = useState<CoachSessionListItem[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [releasingScheduleId, setReleasingScheduleId] = useState<string | null>(null);

  const [coaches, setCoaches] = useState<AdminCoachSummary[]>([]);
  const [sessionTab, setSessionTab] = useState('upcoming');

  // 各ダイアログのトリガー状態（フォーム状態・送信処理は各ダイアログコンポーネント自身が持つ）
  const [cancelTarget, setCancelTarget] = useState<CoachSessionListItem | null>(null);
  const [bookTarget, setBookTarget] = useState<AdminScheduleSlotSummary | null>(null);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [matchSlotNo, setMatchSlotNo] = useState(1);

  useEffect(() => {
    getCoachesForMatching().then(setCoaches);
  }, []);

  // 顧客が変わったら生徒・以降の選択状態をリセットして再取得
  useEffect(() => {
    setSelectedStudentId('');
    setContracts([]);
    setSelectedTicketId('');
    setSlots([]);
    setSessions([]);
    if (!selectedClientId) {
      setStudents([]);
      return;
    }
    setIsLoadingStudents(true);
    getClientStudents(selectedClientId).then((result) => {
      setStudents(result.success ? result.students : []);
      if (!result.success) showToast(t('toastStudentsFetchFailed'), 'error');
      setIsLoadingStudents(false);
    });
  }, [selectedClientId, showToast, t]);

  // 生徒が変わったら契約・以降の選択状態をリセットして再取得
  useEffect(() => {
    setSelectedTicketId('');
    setSlots([]);
    setSessions([]);
    if (!selectedStudentId) {
      setContracts([]);
      return;
    }
    setIsLoadingContracts(true);
    getStudentLiveSessionContractsForAdmin(selectedStudentId).then((result) => {
      setContracts(result);
      setSelectedTicketId(result.find((c) => c.is_current)?.ticket_id ?? result[0]?.ticket_id ?? '');
      setIsLoadingContracts(false);
    });
  }, [selectedStudentId]);

  const loadTicketDetail = async (ticketId: string) => {
    setIsLoadingDetail(true);
    const [slotsResult, sessionsResult] = await Promise.all([
      getScheduleSlotsForTicket(ticketId),
      getSessionsForTicket(ticketId),
    ]);
    setSlots(slotsResult.success ? slotsResult.slots : []);
    if (!slotsResult.success) showToast(t('toastSlotsFetchFailed'), 'error');
    setSessions(sessionsResult);
    setIsLoadingDetail(false);
  };

  // 契約(チケット)が変わったらスケジュール・セッションを再取得
  useEffect(() => {
    if (!selectedTicketId) {
      setSlots([]);
      setSessions([]);
      return;
    }
    loadTicketDetail(selectedTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId]);

  const handleReleaseSlot = async (scheduleId: string) => {
    setReleasingScheduleId(scheduleId);
    try {
      const result = await releaseLessonScheduleSlot(scheduleId);
      if (result.success) {
        showToast(t('toastReleaseSuccess'), 'success');
        await loadTicketDetail(selectedTicketId);
      } else {
        showToast(result.message || t('toastReleaseFailed'), 'error');
      }
    } finally {
      setReleasingScheduleId(null);
    }
  };

  const openMatchDialog = (slotNo: number) => {
    setMatchSlotNo(slotNo);
    setIsMatchDialogOpen(true);
  };

  const selectedContract = contracts.find((c) => c.ticket_id === selectedTicketId) ?? null;
  // 過去契約（is_current=false）は参照専用とし、操作導線を一切出さない
  const isPastContract = selectedContract !== null && !selectedContract.is_current;

  const activeSlotNos = new Set(slots.filter((s) => s.status === 1).map((s) => s.slot_no));
  const unassignedSlotNos = selectedContract
    ? Array.from({ length: selectedContract.weekly_frequency }, (_, i) => i + 1).filter((n) => !activeSlotNos.has(n))
    : [];

  const now = new Date();
  const upcomingSessions = sessions.filter((s) => s.status === SESSION_STATUS.SCHEDULED && new Date(s.end_datetime) > now);
  const completedSessions = sessions.filter((s) => SESSION_RESULT_STATUSES.includes(s.status));
  // アドミンの変更履歴タブは監査目的のため、コーチ/生徒向けの狭い集合（本人操作の
  // キャンセルのみ）ではなく、起因(cancel_category)を問わず全てのキャンセル済みを見せる
  const changeHistorySessions = sessions.filter((s) => SESSION_NON_ACTIONABLE_STATUSES.includes(s.status));

  const renderSessionList = (list: CoachSessionListItem[], disableActions: boolean) => {
    if (list.length === 0) {
      return <p className="text-xs text-slate-400 py-4">{t('noSessionsInList')}</p>;
    }
    return (
      <ul className="space-y-1.5 max-h-96 overflow-y-auto">
        {list.map((session) => {
          const badge = getAdminSessionStatusBadge(session, tStatus);
          const isScheduled = session.status === SESSION_STATUS.SCHEDULED;
          return (
            <li
              key={session.session_id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-white"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">{formatSessionDateTime(session.start_datetime, locale)}</p>
                <p className="text-[11px] text-slate-400">{t('assignedCoachInline', { name: session.coach_name })}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isScheduled && !disableActions && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-slate-500 hover:text-rose-600"
                    onClick={() => setCancelTarget(session)}
                  >
                    {t('cancelButton')}
                  </Button>
                )}
                <Badge variant="outline" className={`${badge.className} text-[10px] font-bold`}>
                  {badge.label}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Users size={14} className="text-indigo-500" />
            {t('cardTitleSelect')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('clientLabel')}</Label>
              <SearchableSelect
                options={clients.map((c) => ({ value: c.client_id, label: c.client_name }))}
                value={selectedClientId}
                onChange={setSelectedClientId}
                placeholder={t('clientPlaceholder')}
                searchPlaceholder={t('clientSearchPlaceholder')}
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('studentLabel')}</Label>
              <SearchableSelect
                options={students.map((s) => ({ value: s.id, label: t('studentOptionLabel', { name: s.user_name, email: s.email }) }))}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                placeholder={isLoadingStudents ? t('studentPlaceholderLoading') : t('studentPlaceholder')}
                searchPlaceholder={t('studentSearchPlaceholder')}
                disabled={!selectedClientId || isLoadingStudents}
                className="bg-white"
              />
            </div>
          </div>

          <div className="hidden sm:block w-px bg-slate-200" />

          <div className="border-t sm:border-t-0 border-slate-200 pt-4 sm:pt-0 flex-1 space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('contractLabel')}</Label>
            {!selectedStudentId ? (
              <>
                <select disabled value="" className="flex h-9 w-full rounded-md border border-input bg-slate-50 px-3 text-sm text-slate-400 shadow-sm cursor-not-allowed">
                  <option value="">{t('selectStudentFirst')}</option>
                </select>
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3 py-2.5 min-h-13 flex items-center">
                  <p className="text-xs text-slate-300">{t('selectStudentHint')}</p>
                </div>
              </>
            ) : isLoadingContracts ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 h-9">
                <Loader2 size={14} className="animate-spin" />
                {t('checkingContracts')}
              </div>
            ) : contracts.length === 0 ? (
              <p className="text-xs text-slate-400">{t('noLiveSessionContract')}</p>
            ) : (
              <>
                <select
                  value={selectedTicketId}
                  onChange={(e) => setSelectedTicketId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {contracts.map((c) => (
                    <option key={c.ticket_id} value={c.ticket_id}>
                      {c.is_current ? t('contractCurrent') : t('contractPast')}
                      {t('contractDateRange', { start: formatContractDate(c.start_date, locale), end: formatContractDate(c.end_date, locale) })}
                    </option>
                  ))}
                </select>
                {selectedContract && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 space-y-1 min-h-13">
                    <p className="text-xs font-bold text-slate-700">{selectedContract.plan_name}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>{t('weeklyFrequency', { count: selectedContract.weekly_frequency })}</span>
                      <span>{t('usedSessions', { used: selectedContract.used_sessions, total: selectedContract.total_sessions })}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedStudentId && contracts.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Video size={14} className="text-indigo-500" />
              {t('reservationCardTitle')}
              {isPastContract && (
                <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-bold">
                  {t('pastContractBadge')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>

          {selectedTicketId && (
            <CardContent className="space-y-5">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('regularScheduleTitle')}</p>
                    {slots.length === 0 && unassignedSlotNos.length === 0 ? (
                      <p className="text-xs text-slate-400">{t('noMatchingYet')}</p>
                    ) : (
                      <div className="space-y-2">
                        {slots.map((slot) => {
                          const statusInfo = getAdminScheduleStatusLabel(slot.status, tScheduleStatus);
                          const isActive = slot.status === 1;
                          return (
                            <div
                              key={slot.schedule_id}
                              className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-slate-100 bg-slate-50/60"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-700">
                                    {t('slotLabel', { slotNo: slot.slot_no, day: tDay(DAY_KEYS[slot.day_of_week]), start: slot.start_time.slice(0, 5), end: slot.end_time.slice(0, 5) })}
                                  </span>
                                  <Badge variant="outline" className={`${statusInfo.className} text-[10px] font-bold`}>
                                    {statusInfo.label}
                                  </Badge>
                                  {isActive && slot.shortfall > 0 && (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] font-bold">
                                      {t('unassignedShortfall', { count: slot.shortfall })}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">{t('assignedCoach', { name: slot.coach_name })}</p>
                              </div>
                              {isActive && !isPastContract && (
                                <div className="flex items-center gap-2 shrink-0">
                                  {slot.shortfall > 0 && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                      onClick={() => setBookTarget(slot)}
                                    >
                                      <CalendarClock size={13} />
                                      {t('bookSessionButton')}
                                    </Button>
                                  )}
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="text-amber-700 border-amber-200 hover:bg-amber-50"
                                        disabled={releasingScheduleId === slot.schedule_id}
                                      >
                                        {releasingScheduleId === slot.schedule_id ? (
                                          <Loader2 size={13} className="animate-spin" />
                                        ) : (
                                          <RefreshCcw size={13} />
                                        )}
                                        {t('reassignCoachButton')}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="rounded-3xl border-none shadow-2xl p-8">
                                      <AlertDialogHeader className="space-y-3">
                                        <AlertDialogTitle className="text-lg font-black text-slate-800">{t('reassignDialogTitle')}</AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                                          {t('reassignDialogBody', {
                                            slotNo: slot.slot_no,
                                            day: tDay(DAY_KEYS[slot.day_of_week]),
                                            start: slot.start_time.slice(0, 5),
                                            end: slot.end_time.slice(0, 5),
                                            coach: slot.coach_name,
                                          })}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter className="flex gap-3 sm:justify-center mt-6">
                                        <AlertDialogCancel className="flex-1 h-11 rounded-2xl border-none bg-slate-100 text-slate-500 font-bold hover:bg-slate-200">
                                          {t('cancelButton')}
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleReleaseSlot(slot.schedule_id)}
                                          className="flex-1 h-11 rounded-2xl bg-amber-600 text-white font-bold hover:bg-amber-700 border-none"
                                        >
                                          {t('executeButton')}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!isPastContract && unassignedSlotNos.map((slotNo) => (
                          <div
                            key={`unassigned-${slotNo}`}
                            className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-dashed border-slate-200 bg-white"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-400">{t('unassignedSlotLabel', { slotNo })}</span>
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] font-bold">
                                  {t('unassignedBadge')}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{t('unassignedHint')}</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 shrink-0"
                              onClick={() => openMatchDialog(slotNo)}
                            >
                              <UserPlus size={13} />
                              {t('directMatchButton')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('sessionListTitle')}</p>
                    <p className="text-[10px] text-slate-400">
                      {t('sessionListHint')}
                    </p>
                    {sessions.length === 0 ? (
                      <p className="text-xs text-slate-400">{t('noSessionsYet')}</p>
                    ) : (
                      <Tabs value={sessionTab} onValueChange={setSessionTab}>
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="upcoming">{t('tabUpcoming')}</TabsTrigger>
                          <TabsTrigger value="completed">{t('tabCompleted')}</TabsTrigger>
                          <TabsTrigger value="changes">{t('tabChanges')}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="upcoming">
                          {renderSessionList(upcomingSessions, isPastContract)}
                        </TabsContent>
                        <TabsContent value="completed">
                          {renderSessionList(completedSessions, isPastContract)}
                        </TabsContent>
                        <TabsContent value="changes">
                          {renderSessionList(changeHistorySessions, isPastContract)}
                        </TabsContent>
                      </Tabs>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <CancelSessionDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => loadTicketDetail(selectedTicketId)}
      />
      <BookSessionDialog
        target={bookTarget}
        onClose={() => setBookTarget(null)}
        onBooked={() => loadTicketDetail(selectedTicketId)}
      />
      <MatchCoachDialog
        open={isMatchDialogOpen}
        initialSlotNo={matchSlotNo}
        ticketId={selectedTicketId}
        coaches={coaches}
        onClose={() => setIsMatchDialogOpen(false)}
        onMatched={() => loadTicketDetail(selectedTicketId)}
      />
    </div>
  );
}
