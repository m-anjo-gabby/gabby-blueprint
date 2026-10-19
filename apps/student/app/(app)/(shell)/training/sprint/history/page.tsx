import { getUserSprintHistory } from '@/actions/sprintAction';
import { resolveTargetMonth } from '@/lib/userTimezone';
import { SprintHistoryView } from './_components/SprintHistoryView';

interface PageProps {
  searchParams: Promise<{
    month?: string; // YYYY-MM
  }>;
}

export default async function SprintHistoryPage({ searchParams }: PageProps) {
  const { month } = await searchParams;

  // 月指定がない場合は、生徒のタイムゾーンでの今月
  const targetMonth = await resolveTargetMonth(month);

  const res = await getUserSprintHistory(targetMonth);

  return (
    <SprintHistoryView initialData={res.success ? res.data : { sessions: [], drills: [] }} targetMonth={targetMonth} />
  );
}
