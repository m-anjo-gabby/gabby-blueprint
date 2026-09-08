'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Info,
  Loader2,
  MessageCircle,
  TrendingUp,
  TriangleAlert,
  Video,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Section } from '@/components/common/Section';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { hasCoachJoinedSessions } from '@/actions/sessionAction';
import { useEndLesson } from '@/hooks/useEndLesson';
import { EndLessonReasonDialog } from '@/components/session/EndLessonReasonDialog';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS, LIVE_SESSION_END_AFTER_MS } from '@gabby/lib/liveSessionRoom/constants';
import { SESSION_STATUS, type SessionResultSummary } from '@gabby/types/session';
import type { SessionHomeworkEntry } from '@gabby/types/sessionHomework';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import type { SelfTrainingWeekSummary } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  session: SessionResultSummary;
  /** 直近の宿題（このセッション自身の投稿を除く。「前回の宿題」を通話前に振り返るためのもの） */
  recentHomework: SessionHomeworkEntry[];
  /** 直近のLive Sprint実施（このセッション自身の実施分を除く） */
  recentSprints: LessonSprintHistoryListItem[];
  selfTrainingSummary: SelfTrainingWeekSummary;
}

/**
 * セッション準備/実施ハブ。生徒概要画面から通話開始・Live Sprint開始・セッション終了を
 * 直接行う導線を廃止し、個別レッスンセッション単位でここに集約する。ビデオ通話自体は
 * 画面共有等でLive Sprint/教材画面と並行利用できるよう引き続き別タブで開く。
 *
 * Session Info（セッションの識別・通話の開始/終了）とTraining（教材操作）は特性が異なり
 * 誤操作にも繋がりやすいため、別セクションに分離している。Trainingは種類が増える前提
 * （Live Sprintに加えて将来Dialog Practice等）でカードグリッドの形にしてある。
 *
 * このセッション自身の実施記録（入退室ログ・チャット履歴・スプリント履歴）はセッション結果画面
 * （.../result）で確認する前提とし、ここでは重複させない。代わりに、通話前後に画面遷移せず
 * 確認したい「前回までの状況」（前回の宿題・前回のLive Sprint・直近の自主トレ状況）を
 * 要点だけ凝縮して表示する（コーチへのヒアリングで「準備のためになるべく画面遷移せず生徒の
 * 情報を見たい」という要望があったため）。
 */
export function SessionHub({ studentId, session, recentHomework, recentSprints, selfTrainingSummary }: Props) {
  const user = useUserStore((state) => state.user);
  const timezone = user?.timezone || 'Asia/Tokyo';
  // UserStoreInitializerはDBからのプロフィール取得が完了するまでuser_id: 0の仮ユーザーを
  // セットする（timezoneも仮値のAsia/Tokyoになる）。その仮値でセッション日時を表示すると、
  // 実際のコーチのタイムゾーンに切り替わった瞬間にちらつくため、確定するまでは表示しない。
  const isTimezoneReady = !!user && user.user_id !== 0;
  const badge = SESSION_STATUS_BADGE[session.status];
  const { endLesson, endingSessionId, reasonDialogOpen, closeReasonDialog, submitReason, notActionableSessionId } = useEndLesson();
  // 別タブで先にEnd Session済みだった場合、このタブでのEnd SessionクリックはRPC側の
  // 二重確定防止チェックで拒否される。そのエラーを検知したら、リフレッシュせずとも
  // このタブも「既に確定済み」の読み取り専用表示へ切り替える。
  const isActionable = session.status === SESSION_STATUS.SCHEDULED && notActionableSessionId !== session.session_id;

  const [hasCoachJoined, setHasCoachJoined] = useState(false);

  useEffect(() => {
    if (!isActionable) return;
    let cancelled = false;
    hasCoachJoinedSessions([session.session_id]).then((presence) => {
      if (!cancelled) setHasCoachJoined(!!presence[session.session_id]);
    });
    return () => {
      cancelled = true;
    };
  }, [isActionable, session.session_id]);

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

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-8">
      <div>
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
      </div>

      <Section label="Session Info" icon={Info}>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar userName={session.counterpart_name} iconPath={session.counterpart_icon_path} size={48} />
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 truncate">{session.counterpart_name}</p>
                  <span className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border mt-1 ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              </div>
              {isActionable && hasCoachJoined && (
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                  <BadgeCheck size={11} />
                  You joined
                </span>
              )}
            </div>

            {/* 誤ったセッションを操作してしまうことを防ぐため、日時は強調して表示する */}
            <div className="rounded-xl bg-slate-50/80 border border-slate-100 px-4 py-3">
              {isTimezoneReady ? (
                <p className="text-base font-black text-slate-800 tracking-tight">
                  {formatDateTimeEn(session.start_datetime, timezone)} – {formatDateTimeEn(session.end_datetime, timezone)}
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
                    This session’s scheduled end time has passed. Please press End Session once you’re done
                    {!hasCoachJoined && ' (or use Resolve from the Live Sessions list on the student overview if the call didn’t happen)'}.
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
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2.5 rounded-full shadow-md shadow-indigo-200"
                    >
                      <Video size={14} />
                      Start Live Session
                      <ExternalLink size={12} className="opacity-70" />
                    </Link>
                  )}
                  <button
                    onClick={() => endLesson(session.session_id, studentId)}
                    disabled={!hasCoachJoined || endingSessionId === session.session_id}
                    title={hasCoachJoined ? 'Record this session’s outcome' : 'Join the call at least once before ending the session'}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors px-4 py-2.5 rounded-full shadow-sm"
                  >
                    {endingSessionId === session.session_id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    End Session
                  </button>
                </div>
                {isPastActionWindow ? (
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock size={11} className="shrink-0" />
                    Starting a new call or Live Sprint is no longer available for this session — press End Session to record the outcome.
                  </p>
                ) : (
                  <p className={`flex items-center gap-1 text-[11px] ${showEarlyJoinNotice ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                    {showEarlyJoinNotice ? <TriangleAlert size={11} className="shrink-0" /> : <Clock size={11} className="shrink-0" />}
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
                  className="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-500 transition-colors"
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
                  href={`/students/${studentId}/lesson-sprint?session_id=${session.session_id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors px-4 py-2.5 rounded-full shadow-sm"
                >
                  Start
                  <ArrowRight size={12} />
                </Link>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 border-dashed shadow-sm bg-slate-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                  <MessageCircle size={14} />
                  Dialog Practice
                  <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 bg-white border border-slate-200 rounded-full px-1.5 py-0.5">
                    Soon
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-xs text-slate-400 italic">Coming soon.</p>
              </CardContent>
            </Card>
          </div>
        </Section>
      )}

      <Section label="Prep" icon={History}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Last Live Sprint</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {recentSprints.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No previous Live Sprint on record.</p>
              ) : (
                <ul className="space-y-2">
                  {recentSprints.map((entry) => (
                    <li key={entry.lesson_sprint_id}>
                      <Link
                        href={`/students/${studentId}/lesson-sprint/result/${entry.lesson_sprint_id}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{entry.content_name}</p>
                          <p className="text-[11px] text-slate-400">{formatDateTimeEn(entry.insert_date, timezone)}</p>
                        </div>
                        <span className="shrink-0 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
                          {entry.average_score !== null ? `${entry.average_score}/5` : '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Last Homework</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {recentHomework.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No homework posted yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentHomework.map((entry) => (
                    <li key={entry.homework_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-bold text-slate-400">{formatDateTimeEn(entry.insert_date, timezone)}</p>
                      {entry.homework_text && (
                        <p className="text-xs text-slate-700 mt-0.5 line-clamp-2 whitespace-pre-wrap wrap-break-word">{entry.homework_text}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section label="Self-Training" icon={TrendingUp}>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Last {selfTrainingSummary.days} Days</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {selfTrainingSummary.total_questions === 0 ? (
              <p className="text-xs text-slate-400 italic">No self-training activity in the last {selfTrainingSummary.days} days.</p>
            ) : (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xl font-black text-slate-800">{selfTrainingSummary.active_days}<span className="text-xs font-semibold text-slate-400">/{selfTrainingSummary.days} days</span></p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active</p>
                </div>
                <div>
                  <p className="text-xl font-black text-slate-800">{selfTrainingSummary.total_questions}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Questions</p>
                </div>
                <div>
                  <p className="text-xl font-black text-slate-800">{selfTrainingSummary.total_assessments}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Speaking Assessments</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <EndLessonReasonDialog open={reasonDialogOpen} onClose={closeReasonDialog} onSubmit={submitReason} />
    </div>
  );
}
