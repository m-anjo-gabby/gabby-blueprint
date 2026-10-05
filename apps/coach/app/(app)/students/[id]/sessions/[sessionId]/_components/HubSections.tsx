import { getRecentSessionHomework } from '@/actions/sessionHomeworkAction';
import { getSelfTrainingWeekSummary } from '@/actions/studentAction';
import { getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { getStudentDialogueAssignments, getAvailableDialogueContents } from '@/actions/dialogueAction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildLiveSessionHubHref } from '@/lib/liveSession/context';
import { LessonSprintHistoryRow } from '../../../_components/LessonSprintHistoryRow';
import { DialoguePracticeCard } from '../../../_components/DialoguePracticeCard';
import { LastHomeworkList } from './LastHomeworkList';

/*
 * Session Hub の区画ごとのデータ取得。
 * page.tsx が各区画を個別の <Suspense> に包んで SessionHub の差し込み口に渡し、
 * 通話開始・終了の操作（Session Info）は区画の取得を待たずに表示する。
 */

interface SectionProps {
  studentId: string;
  sessionId: string;
}

export async function HubDialoguePractice({ studentId, sessionId }: SectionProps) {
  const [assignments, availableContents] = await Promise.all([
    getStudentDialogueAssignments(studentId),
    getAvailableDialogueContents(studentId),
  ]);
  return (
    <DialoguePracticeCard
      studentId={studentId}
      assignments={assignments}
      availableContents={availableContents}
      liveSessionId={sessionId}
    />
  );
}

export async function HubPrep({ studentId, sessionId }: SectionProps) {
  const [lessonSprintHistory, recentHomework] = await Promise.all([
    getLessonSprintHistory(studentId),
    getRecentSessionHomework(studentId, sessionId),
  ]);
  // 「前回のLive Sprint」は、このセッション自身の実施分を除いた直近のものを指す
  // （このセッション中に既に実施済みの分は結果画面側で確認する）。
  const recentSprints = lessonSprintHistory.filter((s) => s.session_id !== sessionId).slice(0, 3);

  return (
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
                  <LessonSprintHistoryRow
                    studentId={studentId}
                    record={entry}
                    backHref={buildLiveSessionHubHref(studentId, sessionId)}
                    backLabel="Back to Session Hub"
                    liveSessionId={sessionId}
                  />
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
          <LastHomeworkList entries={recentHomework} />
        </CardContent>
      </Card>
    </div>
  );
}

export async function HubSelfTraining({ studentId }: { studentId: string }) {
  const summary = await getSelfTrainingWeekSummary(studentId);
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Last {summary.days} Days</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {summary.total_questions === 0 ? (
          <p className="text-xs text-slate-400 italic">No self-training activity in the last {summary.days} days.</p>
        ) : (
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xl font-black text-slate-800">{summary.active_days}<span className="text-xs font-semibold text-slate-400">/{summary.days} days</span></p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active</p>
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">{summary.total_questions}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Questions</p>
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">{summary.total_assessments}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Speaking Assessments</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
