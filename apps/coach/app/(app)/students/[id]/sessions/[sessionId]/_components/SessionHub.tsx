'use client';

import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Info,
  PhoneOff,
  TrendingUp,
  TriangleAlert,
  Video,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS, LIVE_SESSION_END_AFTER_MS } from '@gabby/lib/liveSessionRoom/constants';
import { useLiveSessionEndSignal } from '@gabby/lib/liveSessionRoom/hooks/useLiveSessionEndSignal';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import {
  isConductedOutcome,
  SESSION_STATUS,
  type SessionOutcome,
  type SessionResultSummary,
} from '@gabby/types/session';
import { ImmersiveHeader } from '@/components/common/ImmersiveHeader';
import { ImmersiveShell } from '@/components/common/ImmersiveShell';
import { Section } from '@/components/common/Section';
import { EndSessionDialog } from '@/components/session/EndSessionDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionStatusBadge } from '@/constants/session';
import { withLiveSessionParam } from '@/lib/liveSession/context';

interface SessionHubProps {
  studentId: string;
  session: SessionResultSummary;
  /*
   * 以下の区画は page.tsx がサーバー側で個別に <Suspense> で包んで渡す（HubSections.tsx）。
   * 通話開始・終了の操作（Session Info）をこれらの取得を待たずに表示するため。
   */
  /** Training区画のDialogue Practiceカード */
  dialoguePractice: React.ReactNode;
  /** 「前回までの状況」（前回のLive Sprint・前回の宿題） */
  prep: React.ReactNode;
  /** 直近の自主トレ状況 */
  selfTraining: React.ReactNode;
}

/**
 * セッション準備/実施ハブ。生徒概要画面から通話開始・Live Sprint開始・セッション終了（実施結果の記録）を
 * 直接行う導線を廃止し、個別レッスンセッション単位でここに集約する。ビデオ通話自体は
 * 画面共有等でLive Sprint/教材画面と並行利用できるよう引き続き別タブで開く。
 *
 * Session Info（セッションの識別・通話の開始/終了）とTraining（教材操作）は特性が異なり
 * 誤操作にも繋がりやすいため、別セクションに分離している。Trainingは種類が増える前提
 * （Live SprintとDialog Practice）でカードグリッドの形にしてある。Dialog Practiceカードは
 * 生徒概要画面のパネル（DialoguePracticeCard）と同一コンポーネントを共有しており、
 * このハブでは`liveSessionId`を渡すことで、教材リンクを開いた事実をこのセッションに
 * 紐づけて記録する（セッション結果画面のDialog Practice History参照）。
 *
 * このセッション自身の実施記録（入退室ログ・チャット履歴・スプリント履歴）はセッション結果画面
 * （.../result）で確認する前提とし、ここでは重複させない。代わりに、通話前後に画面遷移せず
 * 確認したい「前回までの状況」（前回の宿題・前回のLive Sprint・直近の自主トレ状況）を
 * 要点だけ凝縮して表示する（コーチへのヒアリングで「準備のためになるべく画面遷移せず生徒の
 * 情報を見たい」という要望があったため）。
 *
 * このハブへの導線は実施予定（SESSION_STATUS.SCHEDULED）のセッションのみが対象で、確定済みの
 * セッションは呼び出し元（Dashboard/生徒概要等）が常に結果画面（.../result）へ直接遷移させる
 * （LiveSessionHistoryCard.tsx等参照）。つまりこのハブ自体は「これから行う、または今まさに
 * 行っている1件のライブセッションの準備〜実施〜終了」に用途が限定されており、通話前の準備
 * から通話後のEnd Sessionまでを常にHub発の没入シェル（ImmersiveShell）で一気通貫にする
 * （別タブで開くビデオ通話を開始した瞬間に表示が切り替わるような体験を避けるため、通話中か
 * どうかで出し分けず常時没入表示にする）。Live Sprint等コンテンツ側の没入判定（URLの
 * ?session_id=の有無）とは独立しており、混同しないこと（apps/coach/lib/liveSession/context.ts参照）。
 */
export function SessionHub({ studentId, session, dialoguePractice, prep, selfTraining }: SessionHubProps) {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const timezone = user?.timezone || 'Asia/Tokyo';
  // UserStoreInitializerはDBからのプロフィール取得が完了するまでuser_id: 0の仮ユーザーを
  // セットする（timezoneも仮値のAsia/Tokyoになる）。その仮値でセッション日時を表示すると、
  // 実際のコーチのタイムゾーンに切り替わった瞬間にちらつくため、確定するまでは表示しない。
  const isTimezoneReady = !!user && user.user_id !== 0;
  const badge = getSessionStatusBadge(session);
  // 別タブ（通話ルーム）で通話が終了した瞬間にこのハブタブへ知らせてもらい、End Session忘れを防ぐ
  const { hasEnded: hasCallEndedElsewhere } = useLiveSessionEndSignal(session.session_id);
  const [isEndDialogOpen, setIsEndDialogOpen] = useState(false);
  // 別タブで先に記録済みだった場合、このタブでの記録はRPC側の二重確定防止チェックで拒否される。
  // そのエラーを検知したら、リフレッシュせずともこのタブも「既に確定済み」の読み取り専用表示へ切り替える。
  const [isRecordedElsewhere, setIsRecordedElsewhere] = useState(false);
  const isActionable = session.status === SESSION_STATUS.SCHEDULED && !isRecordedElsewhere;
  // 表示時点で自分がアプリ内の通話に入った記録があるか（入退室ログはページと一緒にサーバーで取得済み）
  const hasCoachJoined = session.call_log.some((entry) => entry.role === 'coach');

  const handleRecorded = (outcome: SessionOutcome) => {
    // コーチの欠席・通信トラブル等はキャンセル扱いになり、実施されていないセッションのため
    // 宿題投稿を促す結果画面には遷移しない（このハブ画面はSCHEDULED専用のため、いずれの場合もこのハブには戻らない）
    router.push(
      isConductedOutcome(outcome)
        ? `/students/${studentId}/sessions/${session.session_id}/result`
        : `/students/${studentId}`,
    );
  };

  // 終了予定時刻超過の警告は時間経過で状態が変わるため、画面を開いたまま放置されても
  // 最新状態を保てるよう定期的に「今」を更新する（この用途にのみ使う。ボタンの有効/無効の
  // 見た目はこのタイマーに依存させない。早期入室の可否はクリック時にその場で判定する）。
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const earliestJoinTime = new Date(new Date(session.start_datetime).getTime() - LIVE_SESSION_EARLY_JOIN_BEFORE_MS);
  const isPastScheduledEnd = now > new Date(session.end_datetime);
  // 終了予定時刻からVideo SDKの最大通話時間(LIVE_SESSION_END_AFTER_MS、開始遅延分の猶予も兼ねる)
  // を過ぎたら、新しく通話やLive Sprintを開始する導線は閉じ、End Sessionのみの参照モードにする
  // （既に進行中の通話自体には影響しない。この定数を再利用することで、Video SDK側の最大通話時間の
  // 設定が変わった場合もここが自動的に追従する）。
  const isPastActionWindow = now.getTime() > new Date(session.end_datetime).getTime() + LIVE_SESSION_END_AFTER_MS;
  const [showEarlyJoinNotice, setShowEarlyJoinNotice] = useState(false);
  const [showNotStartedNotice, setShowNotStartedNotice] = useState(false);

  // ボタンは常に活性状態のまま表示し、クリックされた瞬間にのみ判定する
  // （render時点の状態に基づく無効化はせず、画面を放置してもリフレッシュ不要で正しく動く）。
  const handleStartLiveSessionClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (Date.now() < earliestJoinTime.getTime()) {
      e.preventDefault();
      setShowEarlyJoinNotice(true);
      return;
    }
    setShowEarlyJoinNotice(false);
  };

  // 結果は開始予定時刻を過ぎてから記録できる（開始前の欠席・中止はキャンセルで扱う。record_session_outcome と同じ条件）
  const handleEndSessionClick = () => {
    if (Date.now() < new Date(session.start_datetime).getTime()) {
      setShowNotStartedNotice(true);
      return;
    }
    setShowNotStartedNotice(false);
    setIsEndDialogOpen(true);
  };

  return (
    <ImmersiveShell active className="flex flex-col">
      <ImmersiveHeader
        studentName={session.counterpart_name}
        studentIconPath={session.counterpart_icon_path}
        title="Session Hub"
        backHref={`/students/${studentId}`}
        backLabel="Back to Overview"
        info={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}
            >
              {badge.label}
            </span>
            {isTimezoneReady && (
              <span className="hidden md:inline text-[11px] font-bold text-slate-500 whitespace-nowrap">
                {formatDateTimeEn(session.start_datetime, timezone)} –{' '}
                {formatDateTimeEn(session.end_datetime, timezone)}
              </span>
            )}
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-8 pb-8">
          <p className="text-[13px] text-slate-500 max-w-2xl">
            Prep for this session, then click Start Live Session below to begin the call — it opens in a separate tab
            (or window), so you can keep this page open for training (e.g. Live Sprint) and prep info.
          </p>

          <Section label="Session Info" icon={Info}>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {isActionable && hasCoachJoined && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                      <BadgeCheck size={11} />
                      You joined
                    </span>
                  )}
                </div>

                {isActionable && hasCallEndedElsewhere && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-strong">
                    <PhoneOff size={13} className="shrink-0" />
                    The call ended in the other tab. Press End Session below to record the outcome.
                  </div>
                )}

                {/* 誤ったセッションを操作してしまうことを防ぐため、日時は強調して表示する */}
                <div className="rounded-xl bg-slate-50/80 border border-slate-100 px-4 py-3">
                  {isTimezoneReady ? (
                    <p className="text-base font-black text-slate-800 tracking-tight">
                      {formatDateTimeEn(session.start_datetime, timezone)} –{' '}
                      {formatDateTimeEn(session.end_datetime, timezone)}
                    </p>
                  ) : (
                    <div className="h-5 w-56 max-w-full rounded bg-slate-200 animate-pulse" />
                  )}
                </div>

                {isActionable ? (
                  <div className="space-y-1.5 pt-1">
                    {isPastScheduledEnd && (
                      <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        <TriangleAlert size={13} className="shrink-0" />
                        This session’s scheduled end time has passed. Please press End Session to record what happened
                        (including if the lesson was held on an external Zoom, or didn’t take place).
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isPastActionWindow && (
                        <Link
                          href={`/students/${studentId}/room/${session.session_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Opens in a new tab, so you can keep sprint and material screens open alongside the call"
                          onClick={handleStartLiveSessionClick}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand hover:bg-brand-500 transition-colors px-4 py-2.5 rounded-full shadow-md shadow-brand-200"
                        >
                          <Video size={14} />
                          Start Live Session
                          <ExternalLink size={12} className="opacity-70" />
                        </Link>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleEndSessionClick}
                        icon={<CheckCircle2 />}
                        title="Record this session’s outcome"
                        className="h-auto gap-1.5 text-xs font-bold text-slate-600 bg-white border-slate-200 hover:bg-slate-50 px-4 py-2.5 rounded-full [&_svg]:size-3.5"
                      >
                        End Session
                      </Button>
                    </div>
                    {showNotStartedNotice && (
                      <p className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                        <TriangleAlert size={11} className="shrink-0" />
                        You can record the outcome once the session has started (
                        {isTimezoneReady ? formatDateTimeEn(session.start_datetime, timezone) : '…'}). To cancel before
                        then, use Cancel on the student’s overview.
                      </p>
                    )}
                    {isPastActionWindow ? (
                      <p className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock size={11} className="shrink-0" />
                        Starting a new call or Live Sprint is no longer available for this session — press End Session
                        to record the outcome.
                      </p>
                    ) : (
                      <p
                        className={`flex items-center gap-1 text-[11px] ${showEarlyJoinNotice ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}
                      >
                        {showEarlyJoinNotice ? (
                          <TriangleAlert size={11} className="shrink-0" />
                        ) : (
                          <Clock size={11} className="shrink-0" />
                        )}
                        {showEarlyJoinNotice
                          ? `Not yet — you can start at ${formatDateTimeEn(earliestJoinTime, timezone)}`
                          : `Available starting ${formatDateTimeEn(earliestJoinTime, timezone)}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                    <p className="text-xs text-slate-500">This lesson has already been finalized.</p>
                    <Link
                      href={`/students/${studentId}/sessions/${session.session_id}/result`}
                      className="shrink-0 text-xs font-bold text-brand hover:text-brand-500 transition-colors"
                    >
                      View Session Result
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </Section>

          {isActionable && !isPastActionWindow && (
            <Section label="Training">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Zap size={14} className="fill-current text-amber-400" />
                      Live Sprint
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-3">
                    <p className="text-xs text-slate-500">Run a scored practice drill together during the call.</p>
                    <Link
                      href={withLiveSessionParam(`/students/${studentId}/lesson-sprint`, session.session_id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors px-4 py-2.5 rounded-full shadow-sm"
                    >
                      Start
                      <ArrowRight size={12} />
                    </Link>
                  </CardContent>
                </Card>

                {dialoguePractice}
              </div>
            </Section>
          )}

          <Section label="Prep" icon={History}>
            {prep}
          </Section>

          <Section label="Self-Training" icon={TrendingUp}>
            {selfTraining}
          </Section>
        </div>
      </div>

      <EndSessionDialog
        open={isEndDialogOpen}
        sessionId={session.session_id}
        studentName={session.counterpart_name}
        onClose={() => setIsEndDialogOpen(false)}
        onRecorded={handleRecorded}
        onNotActionable={() => setIsRecordedElsewhere(true)}
      />
    </ImmersiveShell>
  );
}
