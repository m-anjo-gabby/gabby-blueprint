import { notFound } from 'next/navigation';
import { getStudentOverview } from '@/actions/studentAction';
import { getAvailableSprintContents, getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { LessonSprintApp } from './_components/LessonSprintApp';

export default async function LessonSprintSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      profile={overview.profile}
      lessonSprints={lessonSprints}
      contents={contents}
    />
  );
}
