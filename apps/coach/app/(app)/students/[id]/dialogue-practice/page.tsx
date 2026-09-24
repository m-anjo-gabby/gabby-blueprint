import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getStudentOverview } from '@/actions/studentAction';
import { getAvailableDialogueContents, getStudentDialogueAssignments } from '@/actions/dialogueAction';
import { DialoguePracticeManager } from './_components/DialoguePracticeManager';

export default async function DialoguePracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const [availableContents, assignments] = await Promise.all([
    getAvailableDialogueContents(id),
    getStudentDialogueAssignments(id),
  ]);

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <Link
          href={`/students/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">
          Dialogue Practice — {overview.profile.user_name}
        </h1>
      </div>

      <div className="max-w-3xl mx-auto">
        <DialoguePracticeManager
          studentId={id}
          availableContents={availableContents}
          initialAssignments={assignments}
        />
      </div>
    </div>
  );
}
