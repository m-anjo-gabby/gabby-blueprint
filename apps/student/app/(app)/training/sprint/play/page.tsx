// 📄 apps/student/app/(app)/training/sprint/play/page.tsx

import { getSprintQuestionsAction } from "@/actions/sprintAction";
import { SprintSelect } from "./_components/SprintSelect";
import { SprintDrillPlayer } from "./_components/SprintDrillPlayer";
// import { SprintTimePlayer } from "./_components/SprintTimePlayer"; // ⏱️ 実装時にインポート
import { SprintQuestion, SprintQuestionType, SprintAnswerType } from "@gabby/types/sprint";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{
    mode?: string;
    type?: string;
    answer_type?: string; // ⚡ 追加：Speed用の回答タイプを受け取る
    level?: string;
    content_id?: string;
    resume_id?: string;
    resume?: string; // 🔖 栞判定用のクエリ
    duration?: string; // ⏱️ スプリント制限時間
  }>;
}

export default async function SprintPlayPage({ searchParams }: PageProps) {
  // 1. クエリパラメータの安全な解決 (非同期 Await)
  const resolvedParams = await searchParams;
  
  const mode = resolvedParams.mode === 'sprint' ? 'sprint' : 'drill';
  const rawType = resolvedParams.type || '0';
  const rawAnswerType = resolvedParams.answer_type || '0'; // ⚡ 追加
  const rawLevel = resolvedParams.level; // 💡 選択された時のみ値が入る
  const contentId = resolvedParams.content_id || '';
  const resumeId = resolvedParams.resume_id || undefined;
  const isResume = resolvedParams.resume === 'true';

  // 2. パラメータのバリデーションチェック
  const validTypes: SprintQuestionType[] = ['0', '4', '5', '6'];
  const questionType = validTypes.includes(rawType as SprintQuestionType)
    ? (rawType as SprintQuestionType)
    : '0';

  // ⚡ 追加：answerType のバリデーション（Speedかつ'1'のときのみ'1'(NO)、それ以外はすべて'0'(YES/通常)）
  const answerType: SprintAnswerType = (rawAnswerType === '1' && questionType === '0') ? '1' : '0';

  // ────────────────────────────────────────────────────────────
  // 🧭 分岐レイヤーA: レベル未指定 ＆ 栞ではない ＝ 「Ready画面」を表示
  // ────────────────────────────────────────────────────────────
  // 教材カード一覧から遷移してきた直後（levelがまだURLにない状態）は、
  // サーバーでのデータ取得は行わず、即座に設定画面をクライアントに返します。
  if (!rawLevel && !isResume) {
    return (
      <SprintSelect 
        initialConfig={{
          mode: mode,
          questionType: questionType
        }}
      />
    );
  }

  // ────────────────────────────────────────────────────────────
  // ⚙️ データフェッチレイヤー (栞再開、またはReady画面で確定した後の処理)
  // ────────────────────────────────────────────────────────────
  // 確定したレベルのパース（栞再開時でlevelが省略されている場合はデフォルトをBasic、または1に設定）
  const parsedLevel = parseInt(rawLevel || '', 10);
  const defaultLevel = (questionType === '0' || questionType === '4') ? 0 : 1; // Basic対応種別は0
  const difficultyLevel = isNaN(parsedLevel) ? defaultLevel : parsedLevel;

  // 💡 不整合チェック (ドリルモードなのに contentId がない不正なURL状態を検知)
  const isInvalidParams = mode === 'drill' && !contentId;

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

  // 🚫 4. エンプティステート表示 (不整合またはデータ未取得時)
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

  // ────────────────────────────────────────────────────────────
  // 🏎️ 5. モードごとのプレイヤー切り替え（ハイブリッド配線）
  // ────────────────────────────────────────────────────────────
  
  // A. ドリルモード (通常確定後、または栞からのダイレクト突入ケース)
  if (mode === 'drill') {
    return (
      <SprintDrillPlayer 
        questions={questions} 
        contentId={contentId} 
        initialQuestionId={resumeId} 
      />
    );
  }

  // B. ⚡ スプリントモード
  const duration = resolvedParams.duration || '60';

  return (
    <div className="w-full min-h-screen bg-slate-900 flex items-center justify-center text-white">
      {/* <SprintTimePlayer 
        questions={questions} 
        contentId={contentId} 
        answerType={answerType} // ⚡ YES('0') / NO('1') モードの引き渡し
        duration={parseInt(duration, 10)} 
      /> 
      */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-amber-400">Sprint Mode Coming Soon</h2>
        <p className="text-sm text-slate-400">
          型: {questionType} (回答モード: {answerType === '1' ? 'NO' : 'YES'}) / レベル: {difficultyLevel} / 制限時間: {duration}s のタイムアタックプレイヤーは準備中です。
        </p>
      </div>
    </div>
  );
}