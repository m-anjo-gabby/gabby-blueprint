'use client';

import { use, useEffect } from "react";
import { getSprintQuestionsAction, getLastSprintSessionAction, getContentAction } from "@/actions/sprintAction";
import { SprintSelect } from "./_components/SprintSelect";
import { SprintDrillPlayer } from "./_components/SprintDrillPlayer";
import { SprintTimePlayer } from "./_components/SprintTimePlayer";
import { SprintQuestionType, SprintAnswerType, QUESTION_TYPES } from "@gabby/types/sprint";
import { useSprintStore } from "@/stores/useSprintStore";
import { AlertCircle, Volume2, BookOpen } from "lucide-react";
import Link from "next/link";
import { ContentLoading } from "@/components/common/ContentLoading";
import { ImmersiveNotice, noticeActionClass } from "@/components/shell/ImmersiveNotice";

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

export default function SprintPlayPage({ searchParams }: PageProps) {
  const resolvedParams = use(searchParams);
  const contentId = resolvedParams.content_id || '';

  // ────────────────────────────────────────────────────────────
  // 📦 状態管理（Zustandストアへ一元化、ローカルuseStateは排除）
  // ────────────────────────────────────────────────────────────
  const { config, ui, session, setUiView, setConfig, startSession, clearSessionProgress, setContentMetadata, setContentName } = useSprintStore();

  // ────────────────────────────────────────────────────────────
  // 🧭 初期値のサーバー・DB連動フェッチ（競合解消のコアロジック）
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const initializeConfigAndView = async () => {
      // プレイヤーから「戻ってきた」場合はストアのセッション状態が最優先
      // 💡 体系化された session オブジェクトの有無でクリーンに判定
      const isReturningFromSession = session?.isActive && config.contentId === contentId;

      // 🌟 教材切り替え時（戻りセッションでない場合）はストアに前回の教材情報が残っているため、
      // config/contentMetadataの再取得が完了するまでSprintSelectをマウントさせない
      if (!isReturningFromSession) {
        setUiView('loading');
      }

      let targetConfig;

      if (isReturningFromSession) {
        // =========================================================================
        // 🌟 修正のコア箇所：プレイヤーからの戻り時はストアの実施設定を100%完全復元する
        // =========================================================================
        targetConfig = {
          mode: config.mode,
          questionType: (config.questionType || '0') as SprintQuestionType,
          level: config.level || '0',
          timeLimitSec: config.timeLimitSec,
          contentId: config.contentId,
          answerType: config.answerType,
          sprintType: config.sprintType,
        };
      } else {
        // プレイヤーからの戻りでない（完全な初回アクセス時）は、従来通りDB履歴やURLから取得
        let dbConfig = null;
        const res = await getLastSprintSessionAction();
        if (res && res.success && res.data) {
          dbConfig = res.data;
        }

        // ⚡ URLパラメータに content_id が無い場合は、最新 of DB履歴からフォールバック
        const fallbackContentId = contentId || dbConfig?.content_id || '';

        // 優先順位: 1. DB履歴(dbConfig) > 2. URLパラメータ > 3. システムデフォルト
        const fallbackType = (dbConfig?.question_type || resolvedParams.type || '0') as SprintQuestionType;
        const fallbackLevel = resolvedParams.level || String(dbConfig?.difficulty_level ?? QUESTION_TYPES[fallbackType]?.minLevel ?? 0);
        const fallbackTime = parseInt(resolvedParams.time_limit_sec || '', 10) || dbConfig?.time_limit_sec || 60;

        // モード判定の解決
        let fallbackMode: 'drill' | 'sprint' = 'sprint';
        if (resolvedParams.mode === 'sprint') {
          fallbackMode = 'sprint';
        } else if (resolvedParams.mode === 'drill') {
          fallbackMode = 'drill';
        } else {
          const isExplicitDrill = (dbConfig && String(dbConfig.sprint_type) === '0');
          fallbackMode = isExplicitDrill ? 'drill' : 'sprint';
        }

        targetConfig = {
          mode: fallbackMode, 
          questionType: fallbackType,
          level: fallbackLevel,
          timeLimitSec: fallbackTime,
          contentId: fallbackContentId,
          answerType: (resolvedParams.answer_type as SprintAnswerType) || '0',
          sprintType: resolvedParams.sprint_type || '0',
        };
      }

      // ストアのグローバル設定を一括更新
      setConfig(targetConfig);

      // コンテンツのメタデータを取得してストアに格納
      const fallbackContentId = targetConfig.contentId;
      if (fallbackContentId) {
        const contentRes = await getContentAction(fallbackContentId);
        if (contentRes && contentRes.success && contentRes.data) {
          setContentMetadata(contentRes.data.metadata?.sprint || null);
          setContentName(contentRes.data.content_name || null);
        } else {
          setContentMetadata(null);
          setContentName(null);
        }
      } else {
        setContentMetadata(null);
        setContentName(null);
      }

      // 初期表示Viewの決定
      const isResume = resolvedParams.resume === 'true';
      const hasLevel = !!resolvedParams.level;
      
      if (!targetConfig.contentId) {
        setUiView('no_content');
      } else if (isReturningFromSession) {
        setUiView('selecting');
        // 💡 configをセットしてからフラグをクリアする。
        // SprintSelect は props 経由で完全に初期化されるため、フラグをクリアしても安全
        clearSessionProgress();
      } else if (isResume || hasLevel) {
        setUiView('gesture_needed');
      } else {
        setUiView('selecting');
      }
    };

    initializeConfigAndView();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams, contentId]);

  // ────────────────────────────────────────────────────────────
  // ⚙️ セッション開始ハンドラー
  // ────────────────────────────────────────────────────────────
  const handleStartSession = async (selectedConfig: {
    mode: 'drill' | 'sprint';
    questionType: SprintQuestionType;
    level: string;
    timeLimitSec: number;
    answerType: SprintAnswerType;
    isAssessmentMode?: boolean;
  }) => {
    setUiView('loading');
    
    const validTypes: SprintQuestionType[] = ['0', '4', '5', '6'];
    const questionType = validTypes.includes(selectedConfig.questionType)
      ? selectedConfig.questionType
      : '0';

    const parsedLevel = parseInt(selectedConfig.level || '', 10);
    const difficultyLevel = isNaN(parsedLevel) ? QUESTION_TYPES[questionType].minLevel : parsedLevel;

    const targetContentId = config.contentId || contentId;

    if (!targetContentId) {
      setUiView('error');
      return;
    }

    const response = await getSprintQuestionsAction(
      targetContentId,
      questionType,
      difficultyLevel,
      selectedConfig.mode
    );

    if (response.success && response.data && response.data.length > 0) {
      const sprintType = resolvedParams.sprint_type || response.data[0]?.sprint_type || '0';
      const isAssessmentMode = selectedConfig.isAssessmentMode !== undefined ? selectedConfig.isAssessmentMode : config.isAssessmentMode;

      // 💡 ストア側のアクションに集約してセッション情報・初期化を一撃で適用
      startSession({
        questions: response.data,
        mode: selectedConfig.mode,
        config: {
          contentId: targetContentId,
          sprintType,
          questionType,
          level: String(difficultyLevel),
          answerType: selectedConfig.answerType,
          timeLimitSec: selectedConfig.timeLimitSec,
          mode: selectedConfig.mode,
          isAssessmentMode
        },
        resumeId: resolvedParams.resume_id
      });

      setUiView(selectedConfig.mode);
    } else {
      setUiView('error');
    }
  };

  // ────────────────────────────────────────────────────────────
  // 🏎️ ビューレンダリング
  // ────────────────────────────────────────────────────────────

  if (ui.view === 'loading') {
    return (
      <ContentLoading
        title="Preparing your session"
        subtitle="トレーニングを準備しています..."
      />
    );
  }

  // 0. 教材未割り当て・取得不可時のエンプティステート
  if (ui.view === 'no_content' || !config.contentId) {
    return (
      <ImmersiveNotice
        icon={<BookOpen size={28} />}
        title="教材が選択されていません"
        description={<>教材データを取得できません。<br />教材一覧からトレーニングする教材を選択してください。</>}
        actions={<Link href="/library" className={noticeActionClass()}>教材一覧へ</Link>}
      />
    );
  }

  // 1. 選択画面
  if (ui.view === 'selecting') {
    return (
      <SprintSelect
        onStart={handleStartSession}
      />
    );
  }

  // 2. ジェスチャー待ち画面（直接アクセス時のみ）
  if (ui.view === 'gesture_needed') {
    return (
      <ImmersiveNotice
        icon={<Volume2 size={26} className="animate-pulse" />}
        title="トレーニングを再開します"
        description="音声を有効にするため、下のボタンを押してください。"
        actions={
          <button
            type="button"
            onClick={() => {
              const audio = new Audio();
              audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
              audio.play().catch(() => {});
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
              
              handleStartSession({
                mode: config.mode,
                questionType: config.questionType || '0',
                level: String(config.level),
                timeLimitSec: config.timeLimitSec,
                answerType: (resolvedParams.answer_type as SprintAnswerType) || '0',
                isAssessmentMode: config.isAssessmentMode
              });
            }}
            className={noticeActionClass()}
          >
            トレーニングを開始
          </button>
        }
      />
    );
  }

  // 4. エラー画面
  if (ui.view === 'error') {
    return (
      <ImmersiveNotice
        tone="error"
        icon={<AlertCircle size={28} />}
        title="教材データを取得できません"
        description="教材データの取得に失敗しました。もう一度一覧からお試しください。"
        actions={<Link href="/dashboard" className={noticeActionClass()}>ホームに戻る</Link>}
      />
    );
  }

  // 5. プレイヤー（SPA切り替え）
  if (ui.view === 'drill') {
    return (
      <SprintDrillPlayer 
        questions={session?.questions || []} 
        initialQuestionId={session?.resumeId} 
        initialStarted={true} 
        onExit={() => setUiView('selecting')}
      />
    );
  }

  if (ui.view === 'sprint') {
    return (
      <SprintTimePlayer 
        questions={session?.questions || []} 
        onExit={() => setUiView('selecting')}
      />
    );
  }

  return null;
}