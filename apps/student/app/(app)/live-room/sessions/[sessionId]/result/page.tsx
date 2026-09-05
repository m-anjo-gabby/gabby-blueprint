import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { getSessionHomework } from '@/actions/sessionHomeworkAction';
import { StudentSessionResult } from './_components/StudentSessionResult';

export default async function StudentSessionResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [sessionResult, homework] = await Promise.all([
    getSessionResultSummary(sessionId),
    getSessionHomework(sessionId),
  ]);

  if (!sessionResult.success) {
    notFound();
  }

  return <StudentSessionResult session={sessionResult.session} homework={homework} />;
}
