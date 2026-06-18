// apps\student\app\(app)\training\word\history\page.tsx
import { getUserWordHistoryAction } from "@/actions/wordAction";
import { WordHistoryView } from "./_components/WordHistoryView";

export const dynamic = 'force-dynamic';

interface PageProps {
  // 💡 Next.js 15の仕様変更に合わせ、Promise型として定義します
  searchParams: Promise<{
    month?: string; // YYYY-MM
  }>;
}

export default async function WordHistoryPage({ searchParams }: PageProps) {
  // 💡 重要: searchParams は Promise なので、アクセスする前に必ず await します
  const resolvedSearchParams = await searchParams;
  const { month } = resolvedSearchParams;

  // 月指定がない場合は現在の月をデフォルトにする
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = month || currentMonth;

  const res = await getUserWordHistoryAction(targetMonth);

  if (!res.success) {
    console.error("Failed to fetch word history:", res.error);
  }

  // key={targetMonth} で月切り替え時のクリーンマウントを保証
  return (
    <WordHistoryView 
      key={targetMonth} 
      initialData={res.data || []} 
      targetMonth={targetMonth} 
    />
  );
}