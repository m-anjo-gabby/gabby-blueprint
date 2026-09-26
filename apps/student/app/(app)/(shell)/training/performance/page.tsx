import { getUserTrainingPerformanceAction } from "@/actions/performanceAction";
import { TrainingPerformance } from "./_components/TrainingPerformance";
import { createServerClient } from "@gabby/lib/supabase/server";
import { toIsoMonthInZone } from "@gabby/lib/date/date";

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    month?: string;
  }>;
}

export default async function TrainingLogPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { month } = resolvedSearchParams;

  const supabase = await createServerClient();
  let userTimezone = 'Asia/Tokyo';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('com_m_user')
        .select('timezone')
        .eq('id', user.id)
        .single();
      if (userData?.timezone) {
        userTimezone = userData.timezone;
      }
    }
  } catch (_) {
    // タイムゾーン取得失敗時のフォールバック
  }

  // デフォルトは現在の月（ユーザーのタイムゾーンを考慮）
  const currentMonth = toIsoMonthInZone(new Date(), userTimezone);
  const targetMonth = month || currentMonth;

  // 単語・スプリントの統合実績を取得（スタッツ・カレンダー生成のソースになります）
  const res = await getUserTrainingPerformanceAction(targetMonth);

  return (
    <TrainingPerformance 
      initialData={res.data || { words: [], sprint_sessions: [], sprint_drills: [] }} 
      targetMonth={targetMonth} 
    />
  );
}