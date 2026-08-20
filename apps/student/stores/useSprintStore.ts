import { create } from 'zustand';
import { SprintQuestion, SprintQuestionType, SprintAnswerType, QUESTION_TYPES } from "@gabby/types/sprint";
import { MetadataSprint } from "@gabby/types/content";
import { AnalysisResult, FeedbackConfig } from "@gabby/types/speechAssessment";

export type SprintUiView = 'loading' | 'selecting' | 'gesture_needed' | 'error' | 'drill' | 'sprint' | 'no_content';

interface SprintConfigInput {
  mode: 'drill' | 'sprint';
  questionType: SprintQuestionType | null;
  level: string | number;
  timeLimitSec: number;
  contentId: string | null;
  answerType: SprintAnswerType | null;
  sprintType?: string | null;
  isAssessmentMode: boolean;
}

interface SprintSessionResult {
  questionId: string;
  isSkipped: boolean;
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
}

interface SprintState {
  ui: {
    view: SprintUiView;
  };

  contentMetadata: MetadataSprint | null;
  contentName: string | null;

  // 事前設定〜セッション中を通した唯一の設定ソース（SprintSelect/page.tsxが編集し、プレイヤーは参照専用）
  config: {
    mode: 'drill' | 'sprint';
    questionType: SprintQuestionType | null;
    level: string | number;
    timeLimitSec: number;
    contentId: string | null;
    answerType: SprintAnswerType | null;
    sprintType: string | null;
    isAssessmentMode: boolean;
  };

  // アクティブセッションの進行状態（Drill/Sprint共通）
  session: {
    isActive: boolean;
    questions: SprintQuestion[];
    resumeId?: string;
    currentIndex: number;
    sessionResults: SprintSessionResult[];
    pendingQuestionCount: number;
    pendingAssessmentCount: number;
    isRecording: boolean;
  };

  // ドリルモード専用のプレイヤーUI状態（SprintTimePlayerは参照しない）
  drill: {
    isRevealed: boolean;
    isAutoPlaying: boolean;
    isPlayingQuestionSequence: boolean;
    isPlayingAnswerSequence: boolean;
    feedback: FeedbackConfig | null;
    analysis: AnalysisResult | null;
    evalType: 'yes' | 'no';
  };

  // ─── アクション ───
  setUiView: (view: SprintUiView) => void;
  setConfig: (config: Partial<SprintConfigInput>) => void;
  startSession: (params: { questions: SprintQuestion[]; mode: 'drill' | 'sprint'; config: SprintConfigInput; resumeId?: string }) => void;
  clearSessionProgress: () => void;
  setContentMetadata: (metadata: MetadataSprint | null) => void;
  setContentName: (name: string | null) => void;

  initSprint: (questions: SprintQuestion[], mode: 'drill' | 'sprint', startIndex?: number) => void;
  resetStore: () => void;

  nextStep: () => { isLast: boolean };
  prevStep: () => void;

  commitAssessmentResult: (questionId: string, feedback: FeedbackConfig, analysis: AnalysisResult) => { isLast: boolean };
  commitSkipResult: (questionId: string) => { isLast: boolean };

  incrementAssessmentCount: () => void;
  clearPendingCounts: () => { questionCount: number; assessmentCount: number };
  setIsRevealed: (revealed: boolean) => void;
  setIsRecording: (recording: boolean) => void;
  setPlayingQuestionSequence: (playing: boolean) => void;
  setPlayingAnswerSequence: (playing: boolean) => void;
  setFeedback: (feedback: FeedbackConfig | null) => void;
  setAnalysis: (analysis: AnalysisResult | null) => void;
  toggleAutoPlay: (force?: boolean) => void;
  setDrillEvalType: (type: 'yes' | 'no') => void;
  // ドリルの発話評価完了時に analysis/feedback/isRecording/isRevealed を一括で確定させる専用アクション
  commitDrillRecordingResult: (analysis: AnalysisResult, feedback: FeedbackConfig) => void;
}

const initialSession: SprintState['session'] = {
  isActive: false,
  questions: [],
  resumeId: undefined,
  currentIndex: 0,
  sessionResults: [],
  pendingQuestionCount: 0,
  pendingAssessmentCount: 0,
  isRecording: false,
};

export const useSprintStore = create<SprintState>((set, get) => ({
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
    isAssessmentMode: true,
  },
  contentMetadata: null,
  contentName: null,
  session: initialSession,
  drill: {
    isRevealed: false,
    isAutoPlaying: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    feedback: null,
    analysis: null,
    evalType: 'yes',
  },

  setUiView: (view) => set((state) => ({ ui: { ...state.ui, view } })),

  setContentMetadata: (metadata) => set((state) => {
    let nextType = state.config.questionType;
    let nextLevel = state.config.level;

    const isCorpus = metadata?.sprint_type === '1';
    const hasLevel = isCorpus ? metadata?.has_level ?? true : true;

    if (isCorpus && metadata?.supported_types) {
      const support = metadata.supported_types;
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
  })),

  startSession: ({ questions, mode, config: inputConfig, resumeId }) => {
    set((state) => ({
      config: { ...state.config, ...inputConfig, mode },
      session: {
        ...initialSession,
        isActive: true,
        questions,
        resumeId,
      },
      drill: {
        ...state.drill,
        isRevealed: mode === 'sprint', // タイムモードは常にオープン扱い
        isAutoPlaying: false,
        isPlayingQuestionSequence: false,
        isPlayingAnswerSequence: false,
        feedback: null,
        analysis: null,
      },
    }));
  },

  clearSessionProgress: () => set((state) => ({
    session: {
      ...state.session,
      isActive: false // 戻り判定フラグをクリア
    }
  })),

  initSprint: (questions, mode, startIndex = 0) => set((state) => ({
    session: {
      ...state.session,
      questions,
      currentIndex: startIndex,
      sessionResults: [],
      pendingQuestionCount: 0,
      pendingAssessmentCount: 0,
      isRecording: false,
    },
    drill: {
      ...state.drill,
      isRevealed: mode === 'sprint',
      isAutoPlaying: false,
      isPlayingQuestionSequence: false,
      isPlayingAnswerSequence: false,
      feedback: null,
      analysis: null,
    },
  })),

  nextStep: () => {
    const { session } = get();
    const isLast = session.currentIndex >= session.questions.length - 1;
    if (!isLast) {
      set((state) => ({
        session: {
          ...state.session,
          currentIndex: state.session.currentIndex + 1,
          pendingQuestionCount: state.session.pendingQuestionCount + 1,
        },
        drill: { ...state.drill, isRevealed: false, feedback: null, analysis: null },
      }));
    }
    return { isLast };
  },

  prevStep: () => {
    const { session } = get();
    if (session.currentIndex > 0) {
      set((state) => ({
        session: { ...state.session, currentIndex: state.session.currentIndex - 1 },
        drill: { ...state.drill, isRevealed: false, feedback: null, analysis: null },
      }));
    }
  },

  commitAssessmentResult: (questionId, feedback, analysis) => {
    const { config, session } = get();
    const isLast = session.currentIndex >= session.questions.length - 1;

    const newResult: SprintSessionResult = { questionId, isSkipped: false, feedback, analysis };
    const updatedResults = [...session.sessionResults.filter(r => r.questionId !== questionId), newResult];

    set((state) => ({
      session: {
        ...state.session,
        sessionResults: updatedResults,
        // タイムモード（sprint）の場合は評価直後にインデックスを進める
        currentIndex: config.mode === 'sprint' && !isLast ? state.session.currentIndex + 1 : state.session.currentIndex,
      },
    }));

    return { isLast };
  },

  commitSkipResult: (questionId) => {
    const { session } = get();
    const isLast = session.currentIndex >= session.questions.length - 1;

    const newResult: SprintSessionResult = { questionId, isSkipped: true, feedback: null, analysis: null };
    const updatedResults = [...session.sessionResults.filter(r => r.questionId !== questionId), newResult];

    set((state) => ({
      session: {
        ...state.session,
        sessionResults: updatedResults,
        currentIndex: !isLast ? state.session.currentIndex + 1 : state.session.currentIndex,
      },
    }));

    return { isLast };
  },

  incrementAssessmentCount: () => set((state) => ({
    session: { ...state.session, pendingAssessmentCount: state.session.pendingAssessmentCount + 1 },
  })),

  clearPendingCounts: () => {
    const { session } = get();
    const { pendingQuestionCount, pendingAssessmentCount } = session;
    set((state) => ({
      session: { ...state.session, pendingQuestionCount: 0, pendingAssessmentCount: 0 },
    }));
    return { questionCount: pendingQuestionCount, assessmentCount: pendingAssessmentCount };
  },

  setIsRevealed: (isRevealed) => set((state) => ({ drill: { ...state.drill, isRevealed } })),
  setIsRecording: (isRecording) => set((state) => ({ session: { ...state.session, isRecording } })),
  setPlayingQuestionSequence: (isPlayingQuestionSequence) => set((state) => ({ drill: { ...state.drill, isPlayingQuestionSequence } })),
  setPlayingAnswerSequence: (isPlayingAnswerSequence) => set((state) => ({ drill: { ...state.drill, isPlayingAnswerSequence } })),
  setFeedback: (feedback) => set((state) => ({ drill: { ...state.drill, feedback } })),
  setAnalysis: (analysis) => set((state) => ({ drill: { ...state.drill, analysis } })),
  toggleAutoPlay: (force) => set((state) => ({ drill: { ...state.drill, isAutoPlaying: force !== undefined ? force : !state.drill.isAutoPlaying } })),
  setDrillEvalType: (evalType) => set((state) => ({ drill: { ...state.drill, evalType } })),

  commitDrillRecordingResult: (analysis, feedback) => set((state) => ({
    drill: { ...state.drill, analysis, feedback, isRevealed: true },
    session: { ...state.session, isRecording: false },
  })),

  resetStore: () => set({
    session: initialSession,
    ui: { view: 'loading' },
  }),
}));
