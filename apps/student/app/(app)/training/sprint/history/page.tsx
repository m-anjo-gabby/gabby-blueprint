import { getUserSprintHistoryAction } from "@/actions/sprintAction";
import { SprintHistoryView } from "./_components/SprintHistoryView";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    month?: string; // YYYY-MM
  }>;
}

export default async function SprintHistoryPage({ searchParams }: PageProps) {
  const { month } = await searchParams;

  // 月指定がない場合は現在の月をデフォルトにする
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = month || currentMonth;

  const res = await getUserSprintHistoryAction(targetMonth);

  return <SprintHistoryView initialData={res.data || { sessions: [], drills: [] }} targetMonth={targetMonth} />;
}