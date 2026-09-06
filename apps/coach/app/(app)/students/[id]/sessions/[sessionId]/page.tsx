import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { getSessionHomework } from '@/actions/sessionHomeworkAction';
import { SessionHub } from './_components/SessionHub';

/**
 * セッション準備/実施ハブ。生徒概要画面から個別のライブセッションに入るとまずここに来る。
 * 通話開始・Lesson Sprint開始・レッスン終了(finalize_session)の3操作をここに集約し、
 * これまでの入退室ログ・チャット履歴・Lesson Sprint実施状況もあわせて確認できる
 * （生徒概要画面から各機能へ直接飛ぶ導線は廃止し、必ずここを経由する）。
 */
export default async function SessionHubPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  const [sessionResult, homework] = await Promise.all([
    getSessionResultSummary(sessionId),
    getSessionHomework(sessionId),
  ]);

  if (!sessionResult.success) {
    notFound();
  }

  return <SessionHub studentId={id} session={sessionResult.session} homework={homework} />;
}
