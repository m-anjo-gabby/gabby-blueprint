// apps/student/app/(app)/training/page.tsx
import { TrainingLogView } from "./_components/TrainingLogView";

export const dynamic = 'force-dynamic';

// 今後、総合的なスタッツ（当月の総学習時間や合計回答数など）を
// サーバーサイドから渡したくなった場合は、ここでActionを呼び出してプロップスとして渡せます。
export default async function TrainingLogPage() {
  return <TrainingLogView />;
}