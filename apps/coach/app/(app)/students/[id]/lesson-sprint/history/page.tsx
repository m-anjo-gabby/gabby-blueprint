import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getStudentOverview } from '@/actions/studentAction';
import { getLessonSprintHistoryPage } from '@/actions/lessonSprintAction';
import { LessonSprintHistoryList } from './_components/LessonSprintHistoryList';

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
      <div className="max-w-2xl">
        <Link
          href={`/students/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">
          Live Sprint History — {overview.profile.user_name}
        </h1>
      </div>

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
