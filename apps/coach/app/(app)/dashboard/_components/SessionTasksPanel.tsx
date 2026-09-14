import Link from 'next/link';
import { CalendarClock, CheckCircle2, ClipboardList, type LucideIcon, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMySessionTasks } from '@/actions/sessionAction';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';
import type { DayOfWeek } from '@gabby/types/coachAvailability';

function TaskRow({ href, icon: Icon, title, subtitle }: { href: string; icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
    >
      <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 truncate">{title}</p>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>
    </Link>
  );
}

/**
 * ダッシュボードの"Session Tasks"パネル。専用のタスク管理テーブルは持たず、既存のセッション・
 * 宿題・スケジュールの各テーブルから都度導出する（getCoachSessionTasksCore参照）。
 * 生徒単位の画面（生徒概要のLive Sessionsカード等）でしか見えなかった「対応が必要な項目」を、
 * 担当生徒全員分まとめてここに集約する。
 */
export default async function SessionTasksPanel() {
  const tasks = await getMySessionTasks();
  const totalCount = tasks.unfinalizedSessions.length + tasks.missingHomeworkSessions.length + tasks.shortfalls.length;

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800">Session Tasks</CardTitle>
        {totalCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-wider border border-amber-100">
            {totalCount} open
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-2">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 size={22} className="text-emerald-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">You&apos;re all caught up</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.unfinalizedSessions.map((task) => (
              <li key={`unfinalized-${task.session_id}`}>
                <TaskRow
                  href={`/students/${task.student_id}/sessions/${task.session_id}`}
                  icon={TriangleAlert}
                  title={`${task.student_name} — End Session needed`}
                  subtitle="Scheduled end time has passed and this session isn't finalized yet"
                />
              </li>
            ))}
            {tasks.missingHomeworkSessions.map((task) => (
              <li key={`homework-${task.session_id}`}>
                <TaskRow
                  href={`/students/${task.student_id}/sessions/${task.session_id}/result`}
                  icon={ClipboardList}
                  title={`${task.student_name} — Homework not posted`}
                  subtitle="This finalized session doesn't have homework yet"
                />
              </li>
            ))}
            {tasks.shortfalls.map((shortfall) => (
              <li key={`shortfall-${shortfall.schedule_id}`}>
                <TaskRow
                  href={`/students/${shortfall.student_id}`}
                  icon={CalendarClock}
                  title={`${shortfall.student_name} — Makeup session available`}
                  subtitle={`${DAY_OF_WEEK_SHORT_LABEL_EN[shortfall.day_of_week as DayOfWeek]} ${shortfall.start_time.slice(0, 5)}: only ${shortfall.actual_sessions} of ${shortfall.expected_sessions} sessions scheduled`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
