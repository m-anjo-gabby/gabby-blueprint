import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { getRecentSessionHomework } from '@/actions/sessionHomeworkAction';
import { getSelfTrainingWeekSummary } from '@/actions/studentAction';
import { getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { SessionHub } from './_components/SessionHub';

/**
 * セッション準備/実施ハブ。生徒概要画面から個別のライブセッションに入るとまずここに来る。
 * 通話開始・Lesson Sprint開始・レッスン終了(finalize_session)の3操作をここに集約する
 * （生徒概要画面から各機能へ直接飛ぶ導線は廃止し、必ずここを経由する）。
 * このセッション自体の実施記録（入退室ログ・チャット履歴・スプリント履歴）はレッスン結果画面
 * （.../result）が担うため、ここでは重複させず、通話前後に確認したい「前回までの状況」
 * （前回の宿題・前回のLesson Sprint・直近1週間の自主トレ状況）を画面遷移なしで見せることに絞る。
 */
export default async function SessionHubPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  const [sessionResult, recentHomework, lessonSprintHistory, selfTrainingSummary] = await Promise.all([
    getSessionResultSummary(sessionId),
    getRecentSessionHomework(id, sessionId),
    getLessonSprintHistory(id),
    getSelfTrainingWeekSummary(id),
  ]);

  if (!sessionResult.success) {
    notFound();
  }

  // 「前回のLesson Sprint」は、このセッション自身の実施分を除いた直近のものを指す
  // （このセッション中に既に実施済みの分は結果画面側で確認する）。
  const recentSprints = lessonSprintHistory.filter((s) => s.session_id !== sessionId).slice(0, 3);

  return (
    <SessionHub
      studentId={id}
      session={sessionResult.session}
      recentHomework={recentHomework}
      recentSprints={recentSprints}
      selfTrainingSummary={selfTrainingSummary}
    />
  );
}
