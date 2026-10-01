import { notFound } from 'next/navigation';
import { loadSprintResult } from '@/components/training/sprint-result/loadSprintResult';
import { SprintResultDetail } from './_components/SprintResultDetail';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

/** スプリントの履歴から開く結果画面（シェル画面）。実施直後は /training/sprint/result/[id]（没入画面）を使う */
export default async function SprintHistoryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await loadSprintResult(id);

  if (!result) {
    return notFound();
  }

  return <SprintResultDetail {...result} />;
}
