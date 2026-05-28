'use client';

import { useState, use, useMemo, useEffect } from "react";
import { getSprintQuestionsAction } from "@/actions/sprintAction";
import { SprintSelect } from "./_components/SprintSelect";
import { SprintDrillPlayer } from "./_components/SprintDrillPlayer";
import { SprintTimePlayer } from "./_components/SprintTimePlayer";
import { SprintQuestion, SprintQuestionType, SprintAnswerType, SprintConfig, SPRINT_TYPES } from "@gabby/types/sprint";
import { useSprintStore } from "@/stores/useSprintStore";
import { AlertCircle, ArrowLeft, Loader2, Volume2 } from "lucide-react";
import Link from "next/link";
interface PageProps {
  searchParams: Promise<{
    mode?: string;
    type?: string;
    answer_type?: string; // ⚡ Speed用の回答タイプ
    level?: string;
    content_id?: string;
    resume_id?: string;
    resume?: string; // 🔖 栞判定用のクエリ
    time_limit_sec?: string; // ⏱️ スプリント制限時間
  }>;
}

type PlayerView = 'selecting' | 'loading' | 'drill' | 'sprint' | 'error' | 'gesture_needed';

export default function SprintPlayPage({ searchParams }: PageProps) {
  const resolvedParams = use(searchParams);

  // ────────────────────────────────────────────────────────────
  // 🧭 初期表示Viewの決定（useEffectを使わずに算出）
  // ────────────────────────────────────────────────────────────
  const initialView = useMemo((): PlayerView => {
    const isResume = resolvedParams.resume === 'true';
    const hasLevel = !!resolvedParams.level;
    // URLに直接パラメータがある（栞再開やダッシュボードからの即時開始）場合は、
    // iOSジェスチャーを確保するための「Ready」画面を表示する
    if (isResume || hasLevel) return 'gesture_needed';
    return 'selecting';
  }, [resolvedParams]);

  // ────────────────────────────────────────────────────────────
  // 📦 状態管理（SPA的な画面切り替え用）
  // ────────────────────────────────────────────────────────────
  const [view, setView] = useState<PlayerView>(initialView);
  const [questions, setQuestions] = useState<SprintQuestion[]>([]);
  const [resumeId, setResumeId] = useState<string | undefined>();
  const resetStore = useSprintStore((state) => state.resetStore);
  const setSprintConfig = useSprintStore((state) => state.setSprintConfig);

  // ページマウント時にストアを完全に初期化
  // これにより教材一覧（外部）から来た際はストアが空になり、URLパラメータが優先される
  useEffect(() => {
    resetStore();
  }, [resetStore]);

  // パラメータが外部（ブラウザバック等）で変わった場合にViewを同期する
  const [prevParams, setPrevParams] = useState(resolvedParams);
  if (resolvedParams !== prevParams) {
    setPrevParams(resolvedParams);
    setView(initialView);
  }

  // ────────────────────────────────────────────────────────────
  // ⚙️ セッション開始ハンドラー
  // ────────────────────────────────────────────────────────────
  const handleStartSession = async (config: SprintConfig & { answerType: SprintAnswerType }) => {
    setView('loading');
    
    // パラメータのバリデーションチェック
    const validTypes: SprintQuestionType[] = ['0', '4', '5', '6'];
    const questionType = validTypes.includes(config.questionType as SprintQuestionType)
      ? (config.questionType as SprintQuestionType)
      : '0';

    const parsedLevel = parseInt(config.level || '', 10);
    const difficultyLevel = isNaN(parsedLevel) ? SPRINT_TYPES[questionType].minLevel : parsedLevel;

    const response = await getSprintQuestionsAction(
      questionType,
      difficultyLevel,
      config.mode
    );

    if (response.success && response.data && response.data.length > 0) {
      setQuestions(response.data);
      setResumeId(resolvedParams.resume_id);
      
      // Zustandストアに設定を保存
      setSprintConfig({
        contentId: resolvedParams.content_id || '',
        questionType,
        level: String(difficultyLevel),
        answerType: config.answerType,
        timeLimitSec: config.timeLimitSec,
      });

      setView(config.mode);
    } else {
      setView('error');
    }
  };

  // ────────────────────────────────────────────────────────────
  // 🏎️ ビューレンダリング
  // ────────────────────────────────────────────────────────────

  // 1. 選択画面
  if (view === 'selecting') {
    return (
      <SprintSelect 
        initialConfig={{
          mode: resolvedParams.mode === 'sprint' ? 'sprint' : 'drill',
          questionType: (resolvedParams.type as SprintQuestionType) || '0'
        }}
        onStart={handleStartSession}
      />
    );
  }

  // 2. ジェスチャー待ち画面（直接アクセス時のみ）
  if (view === 'gesture_needed') {
    return (
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
        <div className="bg-white p-8 rounded-[36px] shadow-2xl border border-slate-100 w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 text-indigo-600 animate-pulse">
            <Volume2 size={26} strokeWidth={2.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Ready to Start</h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed">
              セッションを再開します。音声を有効にするために下のボタンを押してください。
            </p>
          </div>
          <button
            onClick={() => {
              // ジェスチャー内でのオーディオアンロック
              const audio = new Audio();
              audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
              audio.play().catch(() => {});
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
              
              const qType = (resolvedParams.type as SprintQuestionType) || '0';

              handleStartSession({
                mode: resolvedParams.mode === 'sprint' ? 'sprint' : 'drill',
                questionType: qType,
                level: resolvedParams.level || String(SPRINT_TYPES[qType].minLevel),
                timeLimitSec: parseInt(resolvedParams.time_limit_sec || '60', 10),
                answerType: (resolvedParams.answer_type as SprintAnswerType) || '0'
              });
            }}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            Start Training 🎯
          </button>
        </div>
      </div>
    );
  }

  // 3. ローディング
  if (view === 'loading') {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Preparing Session...</p>
        </div>
      </div>
    );
  }

  // 4. エラー画面
  if (view === 'error') {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto text-rose-500">
            <AlertCircle size={32} strokeWidth={2.5} />
          </div>
          <div className="space-y-2"><h2 className="text-xl font-black text-slate-900 tracking-tight">Data Not Found</h2><p className="text-sm text-slate-500 leading-relaxed px-2">教材データの取得に失敗しました。もう一度一覧からお試しください。</p></div>
          <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest">Go Back</Link>
        </div>
      </div>
    );
  }

  // 5. プレイヤー（SPA切り替え）
  if (view === 'drill') {
    return (
      <SprintDrillPlayer 
        questions={questions} 
        initialQuestionId={resumeId} 
        initialStarted={true} // SelectまたはReady画面でタップ済みであることを子に伝える
        onExit={() => setView('selecting')}
      />
    );
  }

  if (view === 'sprint') {
    return (
      <SprintTimePlayer 
        questions={questions} 
        onExit={() => setView('selecting')}
      />
    );
  }

  // Fallback for unexpected states
  return null;
}