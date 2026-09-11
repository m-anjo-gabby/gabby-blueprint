import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { getSessionHomework, getSessionHomeworkChecklist } from '@/actions/sessionHomeworkAction';
import { SessionResult } from './_components/SessionResult';

export default async function SessionResultPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const [sessionResult, homework, checklist] = await Promise.all([
    getSessionResultSummary(sessionId),
    getSessionHomework(sessionId),
    getSessionHomeworkChecklist(sessionId),
  ]);

  if (!sessionResult.success) {
    notFound();
  }

  return <SessionResult studentId={id} session={sessionResult.session} homework={homework} checklist={checklist} />;
}
