import { notFound } from 'next/navigation';
import { getStudentOverview } from '@/actions/studentAction';
import { getAvailableSprintContents, getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { LessonSprintApp } from './_components/LessonSprintApp';

export default async function LessonSprintSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { id } = await params;
  const { session_id: sessionId } = await searchParams;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const [contents, lessonSprints] = await Promise.all([
    getAvailableSprintContents(),
    getLessonSprintHistory(id),
  ]);

  return (
    <LessonSprintApp
      studentId={id}
      sessionId={sessionId ?? null}
      profile={overview.profile}
      lessonSprints={lessonSprints}
      contents={contents}
    />
  );
}
