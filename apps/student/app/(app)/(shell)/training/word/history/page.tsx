// apps\student\app\(app)\training\word\history\page.tsx
import { getUserWordHistoryAction } from "@/actions/wordAction";
import { WordHistoryView } from "./_components/WordHistoryView";
import { resolveTargetMonth } from "@/lib/userTimezone";

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

  // 月指定がない場合は、生徒のタイムゾーンでの今月
  const targetMonth = await resolveTargetMonth(month);

  const res = await getUserWordHistoryAction(targetMonth);

  // 取得の失敗は getUserWordHistoryAction 側でログに残す
  // 💡 key={targetMonth} は付与しない：月切り替えのたびにフルリマウントされ、
  // モーダルのフェードインや「今月」ボタンの登場アニメーションが毎回再生されてガタつくため、
  // Client Component側の状態・アニメーションを維持したままpropsの更新のみで反映する
  return (
    <WordHistoryView
      initialData={res.data || []}
      targetMonth={targetMonth}
    />
  );
}