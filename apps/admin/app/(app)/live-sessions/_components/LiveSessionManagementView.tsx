'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, RefreshCcw, Users, Video, UserPlus, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';
import {
  getClientStudents,
  getStudentLiveSessionContractsForAdmin,
  getScheduleSlotsForTicket,
  getSessionsForTicket,
  releaseLessonScheduleSlot,
  getCoachesForMatching,
  cancelSessionAsAdmin,
  rescheduleSessionAsAdmin,
  bookMakeupSessionAsAdmin,
  matchStudentWithCoachAsAdmin,
} from '@/actions/adminLiveSessionAction';
import { ADMIN_SESSION_STATUS_BADGE, ADMIN_SCHEDULE_STATUS_LABEL } from '@/constants/session';
import {
  SESSION_STATUS,
  SESSION_NON_ACTIONABLE_STATUSES,
  SESSION_RESULT_STATUSES,
} from '@gabby/types/session';
import type { ClientOption } from '@gabby/types/client';
import type { AdminStudentSummary, AdminScheduleSlotSummary, AdminCoachSummary, AdminContractSummary } from '@gabby/types/adminLiveSession';
import type { CoachSessionListItem } from '@gabby/types/coachStudent';

const DAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];
// セッションは30分単位の枠のため、時間選択もこの粒度に揃える
const TIME_OPTIONS = generateLessonStartTimeOptions('00:00', '23:59');
// レッスン自体の実施時間（枠は30分だが実施は25分。マッチング申請時と同じ前提）
const LESSON_DURATION_MINUTES = 25;

function formatContractDate(iso: string): string {
  return format(new Date(iso), 'yyyy/MM/dd', { locale: ja });
}

function formatSessionDateTime(iso: string): string {
  return format(new Date(iso), 'yyyy/MM/dd (E) HH:mm', { locale: ja });
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

interface Props {
  clients: ClientOption[];
}

export function LiveSessionManagementView({ clients }: Props) {
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

  // キャンセルダイアログ
  const [cancelTarget, setCancelTarget] = useState<CoachSessionListItem | null>(null);
  const [cancelRefund, setCancelRefund] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // 振替ダイアログ
  const [rescheduleTarget, setRescheduleTarget] = useState<CoachSessionListItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  // 未割当チケットの予約ダイアログ
  const [bookTarget, setBookTarget] = useState<AdminScheduleSlotSummary | null>(null);
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  // 直接マッチングダイアログ
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [matchCoachId, setMatchCoachId] = useState('');
  const [matchSlotNo, setMatchSlotNo] = useState('1');
  const [matchDayOfWeek, setMatchDayOfWeek] = useState('1');
  const [matchStartTime, setMatchStartTime] = useState('');
  const [isMatching, setIsMatching] = useState(false);

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
      if (!result.success) showToast('生徒一覧の取得に失敗しました', 'error');
      setIsLoadingStudents(false);
    });
  }, [selectedClientId, showToast]);

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
    if (!slotsResult.success) showToast('スケジュール枠の取得に失敗しました', 'error');
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
        showToast('担当コーチの枠を終了しました。生徒は新しいコーチへ再度リクエストできます', 'success');
        await loadTicketDetail(selectedTicketId);
      } else {
        showToast(result.message || '処理に失敗しました', 'error');
      }
    } finally {
      setReleasingScheduleId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      const result = await cancelSessionAsAdmin(cancelTarget.session_id, cancelRefund, cancelReason || undefined);
      if (result.success) {
        showToast('セッションをキャンセルしました', 'success');
        setCancelTarget(null);
        setCancelRefund(true);
        setCancelReason('');
        await loadTicketDetail(selectedTicketId);
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    setIsRescheduling(true);
    try {
      const duration = new Date(rescheduleTarget.end_datetime).getTime() - new Date(rescheduleTarget.start_datetime).getTime();
      const newStart = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const newEnd = new Date(newStart.getTime() + duration);
      const result = await rescheduleSessionAsAdmin(
        rescheduleTarget.session_id,
        newStart.toISOString(),
        newEnd.toISOString(),
        rescheduleReason || undefined
      );
      if (result.success) {
        showToast('セッションを振替しました', 'success');
        setRescheduleTarget(null);
        setRescheduleDate('');
        setRescheduleTime('');
        setRescheduleReason('');
        await loadTicketDetail(selectedTicketId);
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleBook = async () => {
    if (!bookTarget || !bookDate || !bookTime) return;
    setIsBooking(true);
    try {
      const [startH, startM, startS] = bookTarget.start_time.split(':').map(Number);
      const [endH, endM, endS] = bookTarget.end_time.split(':').map(Number);
      const duration = ((endH * 60 + endM) * 60 + (endS ?? 0)) * 1000 - ((startH * 60 + startM) * 60 + (startS ?? 0)) * 1000;
      const newStart = new Date(`${bookDate}T${bookTime}:00`);
      const newEnd = new Date(newStart.getTime() + duration);
      const result = await bookMakeupSessionAsAdmin(bookTarget.schedule_id, newStart.toISOString(), newEnd.toISOString());
      if (result.success) {
        showToast('セッションを予約しました', 'success');
        setBookTarget(null);
        setBookDate('');
        setBookTime('');
        await loadTicketDetail(selectedTicketId);
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsBooking(false);
    }
  };

  const resetMatchDialog = () => {
    setIsMatchDialogOpen(false);
    setMatchCoachId('');
    setMatchSlotNo('1');
    setMatchDayOfWeek('1');
    setMatchStartTime('');
  };

  const openMatchDialog = (slotNo: number) => {
    setMatchSlotNo(String(slotNo));
    setIsMatchDialogOpen(true);
  };

  const handleMatch = async () => {
    if (!matchCoachId || !matchStartTime) return;
    setIsMatching(true);
    try {
      const result = await matchStudentWithCoachAsAdmin({
        ticketId: selectedTicketId,
        coachId: matchCoachId,
        slotNo: Number(matchSlotNo),
        dayOfWeek: Number(matchDayOfWeek),
        startTime: matchStartTime,
        endTime: addMinutesToTime(matchStartTime, LESSON_DURATION_MINUTES),
      });
      if (result.success) {
        showToast('マッチングが成立しました。セッションが予約されました', 'success');
        resetMatchDialog();
        await loadTicketDetail(selectedTicketId);
      } else {
        showToast(result.message, 'error');
      }
    } finally {
      setIsMatching(false);
    }
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
  // アドミンの変更履歴タブは監査目的のため、コーチ/生徒向けの狭い集合ではなく
  // ライセンス無効化・コーチ交代・アドミン代理キャンセルも含む広い集合を使う
  const changeHistorySessions = sessions.filter((s) => SESSION_NON_ACTIONABLE_STATUSES.includes(s.status));

  const renderSessionList = (list: CoachSessionListItem[], disableActions: boolean) => {
    if (list.length === 0) {
      return <p className="text-xs text-slate-400 py-4">該当するセッションはありません</p>;
    }
    return (
      <ul className="space-y-1.5 max-h-96 overflow-y-auto">
        {list.map((session) => {
          const badge = ADMIN_SESSION_STATUS_BADGE[session.status];
          const isScheduled = session.status === SESSION_STATUS.SCHEDULED;
          return (
            <li
              key={session.session_id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-white"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">{formatSessionDateTime(session.start_datetime)}</p>
                <p className="text-[11px] text-slate-400">担当: {session.coach_name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isScheduled && !disableActions && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-slate-500 hover:text-indigo-600"
                      onClick={() => setRescheduleTarget(session)}
                    >
                      振替
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-slate-500 hover:text-rose-600"
                      onClick={() => setCancelTarget(session)}
                    >
                      キャンセル
                    </Button>
                  </>
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
            対象の選択
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">顧客</Label>
              <SearchableSelect
                options={clients.map((c) => ({ value: c.client_id, label: c.client_name }))}
                value={selectedClientId}
                onChange={setSelectedClientId}
                placeholder="顧客を選択"
                searchPlaceholder="顧客名で検索..."
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">生徒</Label>
              <SearchableSelect
                options={students.map((s) => ({ value: s.id, label: `${s.user_name}（${s.email}）` }))}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                placeholder={isLoadingStudents ? '読み込み中...' : '生徒を選択'}
                searchPlaceholder="生徒名・メールで検索..."
                disabled={!selectedClientId || isLoadingStudents}
                className="bg-white"
              />
            </div>
          </div>

          <div className="hidden sm:block w-px bg-slate-200" />

          <div className="border-t sm:border-t-0 border-slate-200 pt-4 sm:pt-0 flex-1 space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">契約</Label>
            {!selectedStudentId ? (
              <>
                <select disabled value="" className="flex h-9 w-full rounded-md border border-input bg-slate-50 px-3 text-sm text-slate-400 shadow-sm cursor-not-allowed">
                  <option value="">生徒を選択してください</option>
                </select>
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3 py-2.5 min-h-13 flex items-center">
                  <p className="text-xs text-slate-300">生徒を選択すると契約プランの情報が表示されます</p>
                </div>
              </>
            ) : isLoadingContracts ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 h-9">
                <Loader2 size={14} className="animate-spin" />
                契約を確認しています...
              </div>
            ) : contracts.length === 0 ? (
              <p className="text-xs text-slate-400">この生徒はライブセッション付き契約を保有していません</p>
            ) : (
              <>
                <select
                  value={selectedTicketId}
                  onChange={(e) => setSelectedTicketId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {contracts.map((c) => (
                    <option key={c.ticket_id} value={c.ticket_id}>
                      {c.is_current ? '現在の契約 ' : '過去の契約（参照のみ） '}
                      {formatContractDate(c.start_date)} 〜 {formatContractDate(c.end_date)}
                    </option>
                  ))}
                </select>
                {selectedContract && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 space-y-1 min-h-13">
                    <p className="text-xs font-bold text-slate-700">{selectedContract.plan_name}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>週{selectedContract.weekly_frequency}回</span>
                      <span>{selectedContract.used_sessions}/{selectedContract.total_sessions}回消化</span>
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
              ライブセッション予約状況
              {isPastContract && (
                <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-bold">
                  過去契約（参照のみ）
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
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">定期スケジュール枠</p>
                    {slots.length === 0 && unassignedSlotNos.length === 0 ? (
                      <p className="text-xs text-slate-400">まだマッチングが成立していません</p>
                    ) : (
                      <div className="space-y-2">
                        {slots.map((slot) => {
                          const statusInfo = ADMIN_SCHEDULE_STATUS_LABEL[slot.status] ?? { label: '不明', className: 'bg-slate-100 text-slate-500 border-slate-200' };
                          const isActive = slot.status === 1;
                          return (
                            <div
                              key={slot.schedule_id}
                              className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-slate-100 bg-slate-50/60"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-700">
                                    第{slot.slot_no}枠: {DAY_LABELS_JA[slot.day_of_week]}曜 {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
                                  </span>
                                  <Badge variant="outline" className={`${statusInfo.className} text-[10px] font-bold`}>
                                    {statusInfo.label}
                                  </Badge>
                                  {isActive && slot.shortfall > 0 && (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] font-bold">
                                      未割当 {slot.shortfall}枠
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">担当コーチ: {slot.coach_name}</p>
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
                                      セッションを予約
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
                                        コーチ交代
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="rounded-3xl border-none shadow-2xl p-8">
                                      <AlertDialogHeader className="space-y-3">
                                        <AlertDialogTitle className="text-lg font-black text-slate-800">担当コーチの交代</AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                                          第{slot.slot_no}枠（{DAY_LABELS_JA[slot.day_of_week]}曜 {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}、担当: {slot.coach_name}）の担当を終了します。<br />
                                          まだ実施されていない今後のセッションはキャンセルされます（実施済みのセッション結果・チャット・宿題は削除されません）。<br />
                                          終了後、生徒は同じ枠に対して新しいコーチへ改めてリクエストできるようになります（または下の「直接マッチング」でその場で割り当てられます）。<br />
                                          この操作を実行してもよろしいですか？
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter className="flex gap-3 sm:justify-center mt-6">
                                        <AlertDialogCancel className="flex-1 h-11 rounded-2xl border-none bg-slate-100 text-slate-500 font-bold hover:bg-slate-200">
                                          キャンセル
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleReleaseSlot(slot.schedule_id)}
                                          className="flex-1 h-11 rounded-2xl bg-amber-600 text-white font-bold hover:bg-amber-700 border-none"
                                        >
                                          実行する
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
                                <span className="text-xs font-bold text-slate-400">第{slotNo}枠</span>
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] font-bold">
                                  未割当
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">まだコーチが割り当てられていません</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 shrink-0"
                              onClick={() => openMatchDialog(slotNo)}
                            >
                              <UserPlus size={13} />
                              直接マッチング
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">セッション一覧</p>
                    {sessions.length === 0 ? (
                      <p className="text-xs text-slate-400">セッションはまだありません</p>
                    ) : (
                      <Tabs value={sessionTab} onValueChange={setSessionTab}>
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="upcoming">今後の予定</TabsTrigger>
                          <TabsTrigger value="completed">実施済み</TabsTrigger>
                          <TabsTrigger value="changes">変更履歴</TabsTrigger>
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

      {/* --- キャンセルダイアログ（アドミン代理操作） --- */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>セッションのキャンセル（代理操作）</DialogTitle>
            <DialogDescription>
              {cancelTarget && formatSessionDateTime(cancelTarget.start_datetime)} のセッションをキャンセルします。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <Checkbox id="cancel-refund" checked={cancelRefund} onCheckedChange={(v) => setCancelRefund(v === true)} />
              <Label htmlFor="cancel-refund" className="text-xs font-semibold text-slate-600 cursor-pointer">
                チケットを返還する（未割当扱いに戻し、再予約可能にする）
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">理由（任意・内部メモ）</Label>
              <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="例: 顧客都合によりサポート窓口経由で調整" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={isCancelling}>
              閉じる
            </Button>
            <Button type="button" onClick={handleCancel} disabled={isCancelling} className="bg-rose-600 hover:bg-rose-700">
              {isCancelling && <Loader2 size={14} className="animate-spin" />}
              キャンセルする
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- 振替ダイアログ（アドミン代理操作） --- */}
      <Dialog open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>セッションの振替（代理操作）</DialogTitle>
            <DialogDescription>
              {rescheduleTarget && formatSessionDateTime(rescheduleTarget.start_datetime)} のセッションを振替します。
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">新しい日付</Label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">新しい開始時刻</Label>
              <select
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="" disabled>時刻</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">理由（任意・内部メモ）</Label>
            <Textarea rows={2} value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} />
          </div>
          <p className="text-[10px] text-slate-400">※ 新しい時刻はコーチの空き時間・重複が自動チェックされます</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRescheduleTarget(null)} disabled={isRescheduling}>
              閉じる
            </Button>
            <Button type="button" onClick={handleReschedule} disabled={isRescheduling || !rescheduleDate || !rescheduleTime}>
              {isRescheduling && <Loader2 size={14} className="animate-spin" />}
              振替する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- 未割当チケットの予約ダイアログ（アドミン代理操作） --- */}
      <Dialog open={!!bookTarget} onOpenChange={(open) => !open && setBookTarget(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>セッションの予約（代理操作）</DialogTitle>
            <DialogDescription>
              {bookTarget && `第${bookTarget.slot_no}枠（担当: ${bookTarget.coach_name}）の未割当チケットで新規セッションを予約します。`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">日付</Label>
              <input
                type="date"
                value={bookDate}
                onChange={(e) => setBookDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">開始時刻</Label>
              <select
                value={bookTime}
                onChange={(e) => setBookTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="" disabled>時刻</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">※ コーチの空き時間内である必要があります</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBookTarget(null)} disabled={isBooking}>
              閉じる
            </Button>
            <Button type="button" onClick={handleBook} disabled={isBooking || !bookDate || !bookTime}>
              {isBooking && <Loader2 size={14} className="animate-spin" />}
              予約する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- 直接マッチングダイアログ（アドミン代理操作） --- */}
      <Dialog open={isMatchDialogOpen} onOpenChange={(open) => !open && resetMatchDialog()}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>コーチと直接マッチング</DialogTitle>
            <DialogDescription>
              生徒のリクエスト・コーチの承認を経ずに、その場でマッチングを成立させます（セッションも自動で予約されます）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">コーチ</Label>
              <SearchableSelect
                options={coaches.map((c) => ({ value: c.id, label: c.user_name }))}
                value={matchCoachId}
                onChange={setMatchCoachId}
                placeholder="コーチを選択"
                searchPlaceholder="コーチ名で検索..."
                className="bg-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">枠番号</Label>
                <input
                  type="number"
                  min={1}
                  value={matchSlotNo}
                  onChange={(e) => setMatchSlotNo(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">曜日</Label>
                <select
                  value={matchDayOfWeek}
                  onChange={(e) => setMatchDayOfWeek(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {DAY_LABELS_JA.map((label, i) => (
                    <option key={i} value={i}>{label}曜</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">開始時刻</Label>
                <select
                  value={matchStartTime}
                  onChange={(e) => setMatchStartTime(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="" disabled>時刻</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ※ 枠番号は週n回契約のうち何コマ目かを表します（既存の枠と重複する番号は使用できません）。<br />
              ※ コーチの空き時間・既存の予定との重複は自動でチェックされます。
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetMatchDialog} disabled={isMatching}>
              閉じる
            </Button>
            <Button type="button" onClick={handleMatch} disabled={isMatching || !matchCoachId || !matchStartTime}>
              {isMatching && <Loader2 size={14} className="animate-spin" />}
              マッチングを成立させる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
