import { getUserTrainingPerformanceAction } from "@/actions/performanceAction";
import { TrainingPerformance } from "./_components/TrainingPerformance";
import { resolveTargetMonth } from "@/lib/userTimezone";

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
  const res = await getUserTrainingPerformanceAction(targetMonth);

  return (
    <TrainingPerformance 
      initialData={res.data || { words: [], sprint_sessions: [], sprint_drills: [] }} 
      targetMonth={targetMonth} 
    />
  );
}