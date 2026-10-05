import { notFound } from 'next/navigation';
import { loadSprintResult } from '@/components/training/sprint-result/loadSprintResult';
import { SprintResult } from './_components/SprintResult';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

/** スプリント実施直後の結果画面（没入画面）。履歴からは /training/sprint/history/[id] を開く */
export default async function SprintResultPage({ params }: PageProps) {
  const { id } = await params;
  const result = await loadSprintResult(id);

  if (!result) {
    return notFound();
  }

  return <SprintResult {...result} />;
}
