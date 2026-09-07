import { notFound } from 'next/navigation';
import { getLessonSprintResult, getAvailableSprintContents } from '@/actions/lessonSprintAction';
import { LessonSprintResult } from './_components/LessonSprintResult';

export default async function LessonSprintResultPage({
  params,
}: {
  params: Promise<{ id: string; sprintId: string }>;
}) {
  const { id, sprintId } = await params;
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
    />
  );
}
