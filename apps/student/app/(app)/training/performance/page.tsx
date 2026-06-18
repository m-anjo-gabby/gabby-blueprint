// apps/student/app/(app)/training/page.tsx
import { getUserWordHistoryAction } from "@/actions/wordAction";
import { TrainingPerformance } from "./_components/TrainingPerformance";

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    month?: string;
  }>;
}

export default async function TrainingLogPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { month } = resolvedSearchParams;

  // デフォルトは現在の月
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = month || currentMonth;

  // 単語ドリルの履歴を取得（スタッツ・カレンダー生成のソースになります）
  const res = await getUserWordHistoryAction(targetMonth);

  return (
    <TrainingPerformance 
      initialData={res.data || []} 
      targetMonth={targetMonth} 
    />
  );
}