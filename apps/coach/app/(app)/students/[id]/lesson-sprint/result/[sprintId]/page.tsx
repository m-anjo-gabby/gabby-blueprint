import { notFound } from 'next/navigation';
import { getLessonSprintResult } from '@/actions/lessonSprintAction';
import { LessonSprintResult } from './_components/LessonSprintResult';

export default async function LessonSprintResultPage({
  params,
}: {
  params: Promise<{ id: string; sprintId: string }>;
}) {
  const { id, sprintId } = await params;
  const result = await getLessonSprintResult(sprintId);

  if (!result.success) {
    notFound();
  }

  return (
    <LessonSprintResult
      studentId={id}
      record={result.record}
      questions={result.questions}
    />
  );
}
