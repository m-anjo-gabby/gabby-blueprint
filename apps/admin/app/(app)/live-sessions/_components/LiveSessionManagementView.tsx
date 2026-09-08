'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, RefreshCcw, Users, Video } from 'lucide-react';
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
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { useToast } from '@gabby/lib/hooks/useToast';
import {
  getClientStudents,
  getStudentLiveSessionContractsForAdmin,
  getScheduleSlotsForTicket,
  getSessionsForTicket,
  releaseLessonScheduleSlot,
} from '@/actions/adminLiveSessionAction';
import { ADMIN_SESSION_STATUS_BADGE, ADMIN_SCHEDULE_STATUS_LABEL } from '@/constants/session';
import type { ClientOption } from '@gabby/types/client';
import type { AdminStudentSummary, AdminScheduleSlotSummary } from '@gabby/types/adminLiveSession';
import type { StudentLiveSessionContractSummary, CoachSessionListItem } from '@gabby/types/coachStudent';

const DAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatContractDate(iso: string): string {
  return format(new Date(iso), 'yyyy/MM/dd', { locale: ja });
}

function formatSessionDateTime(iso: string): string {
  return format(new Date(iso), 'yyyy/MM/dd (E) HH:mm', { locale: ja });
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
  const [contracts, setContracts] = useState<StudentLiveSessionContractSummary[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);

  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [slots, setSlots] = useState<AdminScheduleSlotSummary[]>([]);
  const [sessions, setSessions] = useState<CoachSessionListItem[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [releasingScheduleId, setReleasingScheduleId] = useState<string | null>(null);

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

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Users size={14} className="text-indigo-500" />
            対象の選択
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </CardContent>
      </Card>

      {selectedStudentId && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Video size={14} className="text-indigo-500" />
              ライブセッション予約状況
            </CardTitle>
            {isLoadingContracts ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                契約を確認しています...
              </div>
            ) : contracts.length === 0 ? (
              <p className="text-xs text-slate-400">この生徒はライブセッション付き契約を保有していません</p>
            ) : contracts.length > 1 ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400">契約</Label>
                <select
                  value={selectedTicketId}
                  onChange={(e) => setSelectedTicketId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {contracts.map((c) => (
                    <option key={c.ticket_id} value={c.ticket_id}>
                      {c.is_current ? '現在の契約 ' : ''}
                      {formatContractDate(c.start_date)} 〜 {formatContractDate(c.end_date)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
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
                    {slots.length === 0 ? (
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
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">担当コーチ: {slot.coach_name}</p>
                              </div>
                              {isActive && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="shrink-0 text-amber-700 border-amber-200 hover:bg-amber-50"
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
                                        終了後、生徒は同じ枠に対して新しいコーチへ改めてリクエストできるようになります。<br />
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
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">セッション一覧</p>
                    {sessions.length === 0 ? (
                      <p className="text-xs text-slate-400">セッションはまだありません</p>
                    ) : (
                      <ul className="space-y-1.5 max-h-96 overflow-y-auto">
                        {sessions.map((session) => {
                          const badge = ADMIN_SESSION_STATUS_BADGE[session.status];
                          return (
                            <li
                              key={session.session_id}
                              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-white"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700">{formatSessionDateTime(session.start_datetime)}</p>
                                <p className="text-[11px] text-slate-400">担当: {session.coach_name}</p>
                              </div>
                              <Badge variant="outline" className={`${badge.className} text-[10px] font-bold shrink-0`}>
                                {badge.label}
                              </Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
