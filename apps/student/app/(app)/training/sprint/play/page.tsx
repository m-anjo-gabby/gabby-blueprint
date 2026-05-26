import { getSprintQuestionsAction } from "@/actions/sprintAction";
import { SprintDrillPlayer } from "./_components/SprintDrillPlayer";
import { SprintQuestion, SprintQuestionType } from "@gabby/types/sprint";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{
    mode?: string;
    type?: string;
    level?: string;
    content_id?: string;
    resume_id?: string;
  }>;
}

export default async function SprintPlayPage({ searchParams }: PageProps) {
  // 1. クエリパラメータの安全な解決 (非同期 Await)
  const resolvedParams = await searchParams;
  
  const mode = resolvedParams.mode === 'drill' ? 'drill' : 'sprint';
  const rawType = resolvedParams.type || '0';
  const rawLevel = resolvedParams.level || '1';
  const contentId = resolvedParams.content_id || '';
  const resumeId = resolvedParams.resume_id || undefined;

  // 2. パラメータのバリデーションチェック
  const validTypes: SprintQuestionType[] = ['0', '4', '5', '6'];
  const questionType = validTypes.includes(rawType as SprintQuestionType)
    ? (rawType as SprintQuestionType)
    : '0';

  const parsedLevel = parseInt(rawLevel, 10);
  const difficultyLevel = isNaN(parsedLevel) ? 1 : parsedLevel;

  // 💡 不整合チェック (ドリルモードなのに contentId がない不正なURL状態を検知)
  const isInvalidParams = mode === 'drill' && !contentId;

  // 3. サーバーアクションを呼び出してデータをフェッチ
  // ✨ 修正ポイント: `let questions: SprintQuestion[] = [];` と明示的に型をバインドします
  let questions: SprintQuestion[] = [];
  let isFetchSuccess = false;

  if (!isInvalidParams) {
    const response = await getSprintQuestionsAction(
      questionType,
      difficultyLevel,
      mode
    );
    
    if (response.success && response.data) {
      questions = response.data;
      isFetchSuccess = true;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 🚫 4. エンプティステート表示 (不整合またはデータ未取得時)
  // ────────────────────────────────────────────────────────────
  if (isInvalidParams || !isFetchSuccess || questions.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto text-rose-500">
            <AlertCircle size={32} strokeWidth={2.5} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Data Not Found
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed px-2">
              教材データの取得に失敗したか、不整合が発生しました。もう一度一覧からお試しください。
            </p>
          </div>

          <Link 
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 active:scale-98 transition-all shadow-md"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Go Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // 5. モードの切り替え判定（ハイブリッド配線）
  if (mode === 'drill') {
    return (
      <SprintDrillPlayer 
        questions={questions} 
        contentId={contentId} 
        initialQuestionId={resumeId} 
      />
    );
  }

  // ⚡ スプリントモード
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