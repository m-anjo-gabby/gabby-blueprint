import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { getSessionHomework, getSessionHomeworkChecklist } from '@/actions/sessionHomeworkAction';
import { StudentSessionResult } from './_components/StudentSessionResult';

export default async function StudentSessionResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [sessionResult, homework, checklist] = await Promise.all([
    getSessionResultSummary(sessionId),
    getSessionHomework(sessionId),
    getSessionHomeworkChecklist(sessionId),
  ]);

  if (!sessionResult.success) {
    notFound();
  }

  return <StudentSessionResult session={sessionResult.session} homework={homework} checklist={checklist} />;
}
