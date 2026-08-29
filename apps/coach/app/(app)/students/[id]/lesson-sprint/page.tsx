import { notFound } from 'next/navigation';
import { getStudentOverview } from '@/actions/studentAction';
import { getAvailableSprintContents } from '@/actions/lessonSprintAction';
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

  const contents = await getAvailableSprintContents();

  return (
    <LessonSprintApp
      studentId={id}
      studentName={overview.profile.user_name}
      contents={contents}
    />
  );
}
