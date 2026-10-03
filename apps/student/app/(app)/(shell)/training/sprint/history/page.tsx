import { getUserSprintHistoryAction } from "@/actions/sprintAction";
import { SprintHistoryView } from "./_components/SprintHistoryView";
import { resolveTargetMonth } from "@/lib/userTimezone";

interface PageProps {
  searchParams: Promise<{
    month?: string; // YYYY-MM
  }>;
}

export default async function SprintHistoryPage({ searchParams }: PageProps) {
  const { month } = await searchParams;

  // 月指定がない場合は、生徒のタイムゾーンでの今月
  const targetMonth = await resolveTargetMonth(month);

  const res = await getUserSprintHistoryAction(targetMonth);

  return <SprintHistoryView initialData={res.data || { sessions: [], drills: [] }} targetMonth={targetMonth} />;
}