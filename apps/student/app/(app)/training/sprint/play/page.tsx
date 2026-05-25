import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSprintQuestionsAction } from '@/actions/sprintAction';
import { SprintTimePlayer } from './_components/SprintTimePlayer';
import { SprintDrillPlayer } from './_components/SprintDrillPlayer';

export const metadata: Metadata = {
  title: 'Sprint Training | Gabby Academy',
  description: 'Gabby Sprint hybrid training room.',
};

interface PlayPageProps {
  // Next.js App Router標準のsearchParams型
  searchParams: Promise<{
    type?: string;  // '0' | '4' | '5' | '6'
    level?: string; // 難易度数値
    mode?: string;  // 'sprint' | 'drill'
  }>;
}

export default async function SprintPlayPage({ searchParams }: PlayPageProps) {
  // 1. クエリパラメータの非同期解決と安全なフォールバックパース
  const resolvedParams = await searchParams;
  const questionType = (resolvedParams.type ?? '0') as '0' | '4' | '5' | '6';
  const difficultyLevel = parseInt(resolvedParams.level ?? '1', 10);
  const mode = (resolvedParams.mode ?? 'sprint') as 'sprint' | 'drill';

  // パラメータが不正な場合は安全にライブラリ（教材一覧）にリダイレクト
  if (!['0', '4', '5', '6'].includes(questionType) || isNaN(difficultyLevel)) {
    redirect('/library');
  }

  // 2. 先ほど定義したお作法通りのServer Actionを叩いてデータを一括フェッチ
  const response = await getSprintQuestionsAction(questionType, difficultyLevel, mode);

  // エラーハンドリング、または問題データが空だった場合の処理
  if (!response.success || !response.data || response.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground text-sm font-medium">
          対象のトレーニング問題が見つかりませんでした。
        </p>
        <a href="/library" className="text-primary underline text-sm">
          教材一覧に戻る
        </a>
      </div>
    );
  }

  const questions = response.data;

  // 3. モードに応じて、関心の分離を徹底した専用コンポーネントを動的マウント
  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 flex flex-col min-h-[calc(100vh-4rem)]">
      {mode === 'sprint' ? (
        // ⏳ タイムアタックモード（制限時間あり、10問リミット盤面）
        <SprintTimePlayer 
          initialQuestions={questions} 
          questionType={questionType} 
        />
      ) : (
        // 📖 教材ドリルモード（無制限、全件しらみつぶし盤面）
        <SprintDrillPlayer 
          initialQuestions={questions} 
          questionType={questionType} 
        />
      )}
    </div>
  );
}