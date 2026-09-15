import { notFound } from 'next/navigation';
import { getLessonSprintResult, getAvailableSprintContents } from '@/actions/lessonSprintAction';
import { LessonSprintResult } from './_components/LessonSprintResult';

export default async function LessonSprintResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sprintId: string }>;
  searchParams: Promise<{ session_id?: string; back?: string; back_label?: string }>;
}) {
  const { id, sprintId } = await params;
  const { session_id: sessionId, back, back_label: backLabel } = await searchParams;
  const [result, contents] = await Promise.all([
    getLessonSprintResult(sprintId),
    getAvailableSprintContents(),
  ]);

  if (!result.success) {
    notFound();
  }

  const content = contents.find((c) => c.content_id === result.record.content_id);

  return (
    <LessonSprintResult
      studentId={id}
      record={result.record}
      questions={result.questions}
      content={content}
      sessionId={sessionId ?? null}
      backHref={back ? decodeURIComponent(back) : null}
      backLabel={backLabel ? decodeURIComponent(backLabel) : null}
    />
  );
}
