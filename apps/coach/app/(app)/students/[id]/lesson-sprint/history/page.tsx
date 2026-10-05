import { notFound } from 'next/navigation';
import { getStudentOverview } from '@/actions/studentAction';
import { getLessonSprintHistoryPage } from '@/actions/lessonSprintAction';
import { LessonSprintHistoryList } from './_components/LessonSprintHistoryList';
import { StudentChildPageHeader } from '../../../_components/StudentsSkeletons';

const HISTORY_PAGE_SIZE = 20;

export default async function LessonSprintHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const initialPage = await getLessonSprintHistoryPage(id, null, HISTORY_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <StudentChildPageHeader studentId={id} title="Live Sprint History" studentName={overview.profile.user_name} className="max-w-2xl" />

      <div className="max-w-2xl mx-auto">
        <LessonSprintHistoryList
          studentId={id}
          initialItems={initialPage.items}
          initialCursor={initialPage.nextCursor}
        />
      </div>
    </div>
  );
}
