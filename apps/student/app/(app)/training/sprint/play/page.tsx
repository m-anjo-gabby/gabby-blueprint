import { getSprintQuestionsAction } from "@/actions/sprintAction";
import { SprintDrillPlayer } from "./_components/SprintDrillPlayer";
import { SprintQuestionType } from "@gabby/types/sprint";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    mode?: string;
    type?: string;
    level?: string;
  }>;
}

export default async function SprintPlayPage({ searchParams }: PageProps) {
  // 1. クエリパラメータの安全な解決 (非同期 Await)
  const resolvedParams = await searchParams;
  
  const mode = resolvedParams.mode === 'drill' ? 'drill' : 'sprint';
  const rawType = resolvedParams.type || '0';
  const rawLevel = resolvedParams.level || '1';

  // 2. 引数の型合わせ (型安全ガード)
  // question_type は '0' | '4' | '5' | '6' のいずれかに厳密に絞り込む
  const validTypes: SprintQuestionType[] = ['0', '4', '5', '6'];
  const questionType = validTypes.includes(rawType as SprintQuestionType)
    ? (rawType as SprintQuestionType)
    : '0';

  // difficulty_level は Server Action 側が number を要求しているため数値変換
  const difficultyLevel = parseInt(rawLevel, 10) || 1;

  // 3. サーバーアクションを呼び出してデータをフェッチ (mode も確実に渡す)
  const response = await getSprintQuestionsAction(questionType, difficultyLevel, mode);

  // エラー、もしくはデータが取得できなかった場合は安全のためトレーニング一覧へ戻す
  if (!response.success || !response.data) {
    redirect("/training");
  }

  const questions = response.data;

  // 4. モードの切り替え判定（ハイブリッド配線）
  if (mode === 'drill') {
    // 📖 教材ドリルモード
    return <SprintDrillPlayer questions={questions} />;
  }

  // ⚡ スプリントモード (現状はプレースホルダー、今後TimePlayerを作成したらここに差し替え)
  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-gray-800">Sprint Mode Coming Soon</h2>
        <p className="text-sm text-gray-500">
          型: {questionType} / レベル: {difficultyLevel} のスプリントプレイヤーは準備中です。
        </p>
      </div>
    </div>
  );
}