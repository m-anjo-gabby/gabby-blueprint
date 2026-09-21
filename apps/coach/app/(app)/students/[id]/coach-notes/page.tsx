import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getStudentOverview, getStudentNotes } from '@/actions/studentAction';
import { CoachNotesHistoryList } from './_components/CoachNotesHistoryList';

export default async function CoachNotesHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const notes = await getStudentNotes(id);

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
          Coach Notes — {overview.profile.user_name}
        </h1>
      </div>

      <div className="max-w-2xl mx-auto">
        <CoachNotesHistoryList notes={notes} />
      </div>
    </div>
  );
}
