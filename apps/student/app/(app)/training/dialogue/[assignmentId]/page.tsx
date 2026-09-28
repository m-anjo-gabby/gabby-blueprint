import { notFound } from 'next/navigation';
import { getMyDialogueAssignments } from '@/actions/dialogueAction';
import { DialoguePracticeDetail } from './_components/DialoguePracticeDetail';

export default async function DialoguePracticePage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;

  // RLS（本人閲覧可ポリシー）により自分自身の割当のみが返るため、
  // 他ユーザーのassignment_idを指定された場合は一覧に含まれず404となる
  const assignments = await getMyDialogueAssignments();
  const assignment = assignments.find((a) => a.assignment_id === assignmentId);

  if (!assignment) {
    notFound();
  }

  return <DialoguePracticeDetail assignment={assignment} />;
}
