import { getStudentSprintProgress } from '@/actions/adminStudentProgressAction';
import { requireUserForTab } from '../_lib/userDetail';
import { SprintProgressPanel } from './_components/SprintProgressPanel';

/** 生徒のスプリントタブ（ステージ・レベル管理） */
export default async function SprintTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, progress] = await Promise.all([requireUserForTab(id, 'sprint'), getStudentSprintProgress(id)]);

  return <SprintProgressPanel userId={user.id} initialProgress={progress} />;
}
