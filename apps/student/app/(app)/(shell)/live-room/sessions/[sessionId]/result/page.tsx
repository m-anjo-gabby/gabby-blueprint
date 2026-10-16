import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { getSessionHomework, markSessionHomeworkViewed } from '@/actions/sessionHomeworkAction';
import { StudentSessionResult } from './_components/StudentSessionResult';

export default async function StudentSessionResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [sessionResult, homework] = await Promise.all([getSessionResultSummary(sessionId), getSessionHomework(sessionId)]);

  if (!sessionResult.success) {
    notFound();
  }

  // 生徒が宿題を開いたことを記録する（コーチの画面の「見たか」に使う。宿題が無い・本人以外は何もしない）
  if (homework) {
    await markSessionHomeworkViewed(sessionId);
  }

  return <StudentSessionResult session={sessionResult.session} homework={homework} />;
}
