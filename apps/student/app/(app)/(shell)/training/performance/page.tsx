import { getUserTrainingPerformance } from '@/actions/performanceAction';
import { resolveTargetMonth } from '@/lib/userTimezone';
import { TrainingPerformance } from './_components/TrainingPerformance';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    month?: string;
  }>;
}

export default async function TrainingLogPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { month } = resolvedSearchParams;

  // デフォルトは現在の月（生徒のタイムゾーンを考慮）
  const targetMonth = await resolveTargetMonth(month);

  // 単語・スプリントの統合実績を取得（スタッツ・カレンダー生成のソースになります）
  const res = await getUserTrainingPerformance(targetMonth);

  return (
    <TrainingPerformance
      initialData={res.success ? res.data : { words: [], sprint_sessions: [], sprint_drills: [] }}
      targetMonth={targetMonth}
    />
  );
}
