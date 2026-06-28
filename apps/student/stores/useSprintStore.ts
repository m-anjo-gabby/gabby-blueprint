import { create } from 'zustand';
import { SprintQuestion, SprintQuestionType, SprintAnswerType, QUESTION_TYPES } from "@gabby/types/sprint";
import { MetadataSprint } from "@gabby/types/content";

// ─── 追加：UIビューの型定義 ───
export type SprintUiView = 'loading' | 'selecting' | 'gesture_needed' | 'error' | 'drill' | 'sprint';

// ─── 追加：一括設定用オブジェクトのインターフェース ───
interface SprintConfigInput {
  mode: 'drill' | 'sprint';
  questionType: SprintQuestionType | null;
  level: string | number;
  timeLimitSec: number;
  contentId: string | null;
  answerType: SprintAnswerType | null;
  sprintType?: string | null;
}

interface SprintState {
  // ─── ① ページ・UI制御（page.tsx管理用） ───
  ui: {
    view: SprintUiView;
  };
  config: {
    mode: 'drill' | 'sprint';
    questionType: SprintQuestionType | null;
    level: string | number;
    timeLimitSec: number;
    contentId: string | null;
    answerType: SprintAnswerType | null;
    sprintType: string | null;
  };
  contentMetadata: MetadataSprint | null;
  contentName: string | null;
  session: {
    isActive: boolean;
    questions: SprintQuestion[];
    resumeId?: string;
  };

  // ─── ② 共通メタデータ（後方互換・既存ロジック用） ───
  mode: 'drill' | 'sprint' | null;
  questions: SprintQuestion[];
  currentIndex: number;
  contentId: string | null;
  sprintType: string | null;
  questionType: string | null;
  answerType: string | null;
  level: string | number;
  
  // ─── ③ 同期・カウント用管理 ───
  pendingQuestionCount: number;
  pendingAssessmentCount: number;
  sessionResults: Array<{
    questionId: string;
    isSkipped: boolean;
    feedback: any;
    analysis: any;
  }>;

  // ─── ④ ドリルモード専用ステート ───
  isRevealed: boolean;
  isAutoPlaying: boolean;
  isPlayingQuestionSequence: boolean;
  isPlayingAnswerSequence: boolean;
  feedback: any | null;
  analysis: any | null;
  drillEvalType: 'yes' | 'no';

  // ─── ⑤ タイムモード（スプリント）専用ステート ───
  timeLimitSec: number;
  isRecording: boolean;

  // ─── ⚙️ アクション ───
  // ページ・UI制御用アクション
  setUiView: (view: SprintUiView) => void;
  setConfig: (config: Partial<SprintConfigInput>) => void;
  startSession: (params: { questions: SprintQuestion[]; mode: 'drill' | 'sprint'; config: SprintConfigInput; resumeId?: string }) => void;
  clearSessionProgress: () => void;
  setContentMetadata: (metadata: MetadataSprint | null) => void;
  setContentName: (name: string | null) => void;
  
  // プレイヤーコア用アクション
  initSprint: (questions: SprintQuestion[], mode: 'drill' | 'sprint', startIndex?: number) => void;
  clearSession: () => void;
  resetStore: () => void;
  
  // ステップ移動（ドリル用）
  nextStep: () => { isLast: boolean };
  prevStep: () => void;
  
  // 結果コミット
  commitAssessmentResult: (questionId: string, feedback: any, analysis: any) => { isLast: boolean };
  commitSkipResult: (questionId: string) => { isLast: boolean };
  
  // 各種カウンター・セッター
  incrementAssessmentCount: () => void;
  clearPendingCounts: () => { questionCount: number; assessmentCount: number };
  setIsRevealed: (revealed: boolean) => void;
  setIsRecording: (recording: boolean) => void;
  setPlayingQuestionSequence: (playing: boolean) => void;
  setPlayingAnswerSequence: (playing: boolean) => void;
  setFeedback: (feedback: any) => void;
  setAnalysis: (analysis: any) => void;
  toggleAutoPlay: (force?: boolean) => void;
  setDrillEvalType: (type: 'yes' | 'no') => void;
}

export const useSprintStore = create<SprintState>((set, get) => ({
  // ─── ① 初期値定義（新規追加分） ───
  ui: {
    view: 'loading',
  },
  config: {
    mode: 'sprint',
    questionType: '0',
    level: '1',
    timeLimitSec: 60,
    contentId: null,
    answerType: '0',
    sprintType: '0',
  },
  contentMetadata: null,
  contentName: null,
  session: {
    isActive: false,
    questions: [],
    resumeId: undefined,
  },

  // ─── ② 初期値の定義（既存分） ───
  mode: null,
  questions: [],
  currentIndex: 0,
  contentId: null,
  sprintType: null,
  questionType: null,
  answerType: null,
  level: 1,
  
  pendingQuestionCount: 0,
  pendingAssessmentCount: 0,
  sessionResults: [],

  isRevealed: false,
  isAutoPlaying: false,
  isPlayingQuestionSequence: false,
  isPlayingAnswerSequence: false,
  feedback: null,
  analysis: null,
  drillEvalType: 'yes',

  timeLimitSec: 60,
  isRecording: false,

  // ─── ⚙️ 新規追加アクション（page.tsx 連動用） ───
  setUiView: (view) => set((state) => ({ ui: { ...state.ui, view } })),
  setContentMetadata: (metadata) => set((state) => {
    let nextType = state.config.questionType;
    let nextLevel = state.config.level;

    const isCorpus = metadata?.sprint_type === '1';
    const hasLevel = isCorpus ? metadata?.has_level ?? true : true;

    if (isCorpus && metadata?.supported_types) {
      const support = metadata.supported_types;
      // 現在のタイプが許可されているかチェック
      const isSupported = (
        (nextType === '0' && support.speed) ||
        (nextType === '4' && support.structure) ||
        (nextType === '5' && support.builders) ||
        (nextType === '6' && support.mastery)
      );

      if (!isSupported) {
        const availableTypes = Object.values(QUESTION_TYPES).filter(t => {
          if (t.value === '0') return support.speed;
          if (t.value === '4') return support.structure;
          if (t.value === '5') return support.builders;
          if (t.value === '6') return support.mastery;
          return false;
        });
        if (availableTypes.length > 0) {
          nextType = availableTypes[0].value;
          nextLevel = hasLevel ? String(QUESTION_TYPES[nextType]?.minLevel ?? '0') : '1';
        }
      }
    }

    if (!hasLevel) {
      nextLevel = '1';
    }

    return { 
      contentMetadata: metadata,
      config: {
        ...state.config,
        questionType: nextType,
        level: nextLevel
      }
    };
  }),
  setContentName: (name) => set({ contentName: name }),
  
  setConfig: (inputConfig) => set((state) => ({
    config: {
      ...state.config,
      ...inputConfig,
    },
    // 後方互換のためルートのメタデータも同期
    ...((inputConfig.mode ? { mode: inputConfig.mode } : {}) as any),
    ...((inputConfig.contentId ? { contentId: inputConfig.contentId } : {}) as any),
    ...((inputConfig.sprintType ? { sprintType: inputConfig.sprintType } : {}) as any),
    ...((inputConfig.questionType ? { questionType: inputConfig.questionType } : {}) as any),
    ...((inputConfig.answerType ? { answerType: inputConfig.answerType } : {}) as any),
    ...((inputConfig.level ? { level: inputConfig.level } : {}) as any),
    ...((inputConfig.timeLimitSec ? { timeLimitSec: inputConfig.timeLimitSec } : {}) as any),
  })),

  startSession: ({ questions, mode, config: inputConfig, resumeId }) => {
    // 1. セッション状態をアクティブに
    set({
      session: {
        isActive: true,
        questions,
        resumeId,
      }
    });

    // 2. configを適用
    get().setConfig(inputConfig);

    // 3. 既存のプレイヤー初期化メソッド(initSprint)を内部実行して完全同期
    get().initSprint(questions, mode);
  },

  clearSessionProgress: () => set((state) => ({
    session: {
      ...state.session,
      isActive: false // 戻り判定フラグをクリア
    }
  })),

  // ─── 🧬 既存のコアロジック（そのまま完全維持） ───
  initSprint: (questions, mode, startIndex = 0) => set((state) => ({
    mode,
    questions,
    currentIndex: startIndex,
    // 共通初期化
    sessionResults: [],
    pendingQuestionCount: 0,
    pendingAssessmentCount: 0,
    isRecording: false,
    // モード別の初期化
    isRevealed: mode === 'sprint' ? true : false, // タイムモードは常にオープン扱い
    isAutoPlaying: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    feedback: null,
    analysis: null,
  })),

  nextStep: () => {
    const { currentIndex, questions } = get();
    const isLast = currentIndex >= questions.length - 1;
    if (!isLast) {
      set((state) => ({ 
        currentIndex: state.currentIndex + 1,
        isRevealed: false,
        feedback: null,
        analysis: null,
        pendingQuestionCount: state.pendingQuestionCount + 1
      }));
    }
    return { isLast };
  },

  prevStep: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set((state) => ({
        currentIndex: state.currentIndex - 1,
        isRevealed: false,
        feedback: null,
        analysis: null
      }));
    }
  },

  commitAssessmentResult: (questionId, feedback, analysis) => {
    const { currentIndex, questions, sessionResults } = get();
    const isLast = currentIndex >= questions.length - 1;
    
    const newResult = { questionId, isSkipped: false, feedback, analysis };
    const updatedResults = [...sessionResults.filter(r => r.questionId !== questionId), newResult];

    set((state) => ({
      sessionResults: updatedResults,
      // タイムモード（sprint）の場合は評価直後にインデックスを進める
      currentIndex: state.mode === 'sprint' && !isLast ? state.currentIndex + 1 : state.currentIndex,
    }));

    return { isLast };
  },

  commitSkipResult: (questionId) => {
    const { currentIndex, questions, sessionResults } = get();
    const isLast = currentIndex >= questions.length - 1;

    const newResult = { questionId, isSkipped: true, feedback: null, analysis: null };
    const updatedResults = [...sessionResults.filter(r => r.questionId !== questionId), newResult];

    set((state) => ({
      sessionResults: updatedResults,
      currentIndex: !isLast ? state.currentIndex + 1 : state.currentIndex,
    }));

    return { isLast };
  },

  incrementAssessmentCount: () => set((state) => ({ pendingAssessmentCount: state.pendingAssessmentCount + 1 })),
  
  clearPendingCounts: () => {
    const { pendingQuestionCount, pendingAssessmentCount } = get();
    set({ pendingQuestionCount: 0, pendingAssessmentCount: 0 });
    return { questionCount: pendingQuestionCount, assessmentCount: pendingAssessmentCount };
  },

  setIsRevealed: (isRevealed) => set({ isRevealed }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setPlayingQuestionSequence: (isPlayingQuestionSequence) => set({ isPlayingQuestionSequence }),
  setPlayingAnswerSequence: (isPlayingAnswerSequence) => set({ isPlayingAnswerSequence }),
  setFeedback: (feedback) => set({ feedback }),
  setAnalysis: (analysis) => set({ analysis }),
  toggleAutoPlay: (force) => set((state) => ({ isAutoPlaying: force !== undefined ? force : !state.isAutoPlaying })),
  setDrillEvalType: (drillEvalType) => set({ drillEvalType }),
  
  clearSession: () => set({ 
    questions: [], 
    currentIndex: 0, 
    sessionResults: [], 
    mode: null,
    session: { isActive: false, questions: [], resumeId: undefined },
    ui: { view: 'loading' }
  }),
  resetStore: () => set({ 
    mode: null, 
    questions: [], 
    currentIndex: 0, 
    sessionResults: [],
    session: { isActive: false, questions: [], resumeId: undefined },
    ui: { view: 'loading' }
  })
}));