'use client';

import { useState, use, useMemo, useEffect } from "react";
import { getSprintQuestionsAction, getLastSprintSessionAction } from "@/actions/sprintAction";
import { SprintSelect } from "./_components/SprintSelect";
import { SprintDrillPlayer } from "./_components/SprintDrillPlayer";
import { SprintTimePlayer } from "./_components/SprintTimePlayer";
import { SprintQuestion, SprintQuestionType, SprintAnswerType, SprintConfig, QUESTION_TYPES } from "@gabby/types/sprint";
import { useSprintStore } from "@/stores/useSprintStore";
import { AlertCircle, Loader2, Volume2 } from "lucide-react";
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
    sprint_type?: string;
  }>;
}

type PlayerView = 'selecting' | 'loading' | 'drill' | 'sprint' | 'error' | 'gesture_needed';

export default function SprintPlayPage({ searchParams }: PageProps) {
  const resolvedParams = use(searchParams);
  const contentId = resolvedParams.content_id || '';

  // ────────────────────────────────────────────────────────────
  // 📦 状態管理（SPA的な画面切り替え用）
  // ────────────────────────────────────────────────────────────
  const [view, setView] = useState<PlayerView>('loading'); // 初期状態を一時的に 'loading' に設定し、DB整合性を担保
  const [serverInitialConfig, setServerInitialConfig] = useState<{
    mode?: 'drill' | 'sprint';
    questionType?: SprintQuestionType;
    level?: string;
    timeLimitSec?: number;
  } | null>(null);

  const [questions, setQuestions] = useState<SprintQuestion[]>([]);
  const [resumeId, setResumeId] = useState<string | undefined>();
  const store = useSprintStore();
  const setSprintConfig = useSprintStore((state) => state.setSprintConfig);
  const setIsActiveSession = useSprintStore((state) => state.setIsActiveSession);

  // ────────────────────────────────────────────────────────────
  // 🧭 初期値のサーバー・DB連動フェッチ（競合解消のコアロジック）
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const initializeConfigAndView = async () => {
      // プレイヤーから「戻ってきた」場合はストアのセッション状態が最優先
      const isReturningFromSession = store.isActiveSession && store.contentId === contentId;
      
      let dbConfig = null;
      // プレイヤーからの戻りでなく、かつ content_id がある場合に最新のDB学習履歴を取得
      if (!isReturningFromSession && contentId) {
        const res = await getLastSprintSessionAction(contentId);
        if (res && res.success && res.data) {
          dbConfig = res.data;
        }
      }

      // 優先順位: 1. DB履歴(dbConfig) > 2. URLパラメータ > 3. システムデフォルト
      // ※ URLの type パラメータは student-path.ts で '0' にハードコードされた「表示ヒント」に過ぎないため、
      //    実際の学習履歴（dbConfig）を優先する。
      const fallbackType = (dbConfig?.question_type || resolvedParams.type || '0') as SprintQuestionType;
      const fallbackLevel = resolvedParams.level || String(dbConfig?.difficulty_level ?? QUESTION_TYPES[fallbackType]?.minLevel ?? 0);
      const fallbackTime = parseInt(resolvedParams.time_limit_sec || '', 10) || dbConfig?.time_limit_sec || 60;
      const fallbackMode = (resolvedParams.mode === 'sprint' || dbConfig?.sprint_type === '1') ? 'sprint' : 'drill';

      const config = {
        mode: fallbackMode as 'drill' | 'sprint',
        questionType: fallbackType,
        level: fallbackLevel,
        timeLimitSec: fallbackTime,
      };

      setServerInitialConfig(config);

      // 初期表示Viewの決定
      const isResume = resolvedParams.resume === 'true';
      const hasLevel = !!resolvedParams.level;
      
      if (isResume || hasLevel) {
        setView('gesture_needed');
      } else {
        setView('selecting');
      }
    };

    initializeConfigAndView();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams, contentId]);

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
    const difficultyLevel = isNaN(parsedLevel) ? QUESTION_TYPES[questionType].minLevel : parsedLevel;

    const response = await getSprintQuestionsAction(
      contentId,
      questionType,
      difficultyLevel,
      config.mode
    );

    if (response.success && response.data && response.data.length > 0) {
      setQuestions(response.data);
      setResumeId(resolvedParams.resume_id);
      
      const sprintType = resolvedParams.sprint_type || response.data[0]?.sprint_type || '0';

      // Zustandストアに設定を保存
      setSprintConfig({
        contentId: contentId,
        sprintType,
        questionType,
        level: String(difficultyLevel),
        answerType: config.answerType,
        timeLimitSec: config.timeLimitSec,
      });

      // プレイヤーへ遷移する前にフラグを立てる（SprintSelectへ戻った際に状態復元に使用）
      setIsActiveSession();

      setView(config.mode);
    } else {
      setView('error');
    }
  };

  // ────────────────────────────────────────────────────────────
  // 🏎️ ビューレンダリング
  // ────────────────────────────────────────────────────────────

  // 🌟 DB整合性データの取得が完了するまでは、不正な初期値での描画を防ぐためローディングで待機
  if (view === 'selecting' && !serverInitialConfig) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Preparing Preferences...</p>
        </div>
      </div>
    );
  }

  // 1. 選択画面
  if (view === 'selecting') {
    return (
      <SprintSelect 
        initialConfig={serverInitialConfig || {
          mode: resolvedParams.mode === 'sprint' ? 'sprint' : 'drill',
          questionType: (resolvedParams.type || '0') as SprintQuestionType,
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
              
              const qType = (serverInitialConfig?.questionType || resolvedParams.type || '0') as SprintQuestionType;

              handleStartSession({
                mode: serverInitialConfig?.mode || (resolvedParams.mode === 'sprint' ? 'sprint' : 'drill'),
                questionType: qType,
                level: serverInitialConfig?.level || resolvedParams.level || String(QUESTION_TYPES[qType].minLevel),
                timeLimitSec: serverInitialConfig?.timeLimitSec || parseInt(resolvedParams.time_limit_sec || '60', 10),
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
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Data Not Found</h2>
            <p className="text-sm text-slate-500 leading-relaxed px-2">教材データの取得に失敗しました。もう一度一覧からお試しください。</p>
          </div>
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

  return null;
}