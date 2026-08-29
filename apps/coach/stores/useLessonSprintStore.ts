import { create } from 'zustand';
import { SprintQuestion, SprintQuestionType, SprintAnswerType } from '@gabby/types/sprint';
import { MetadataSprint } from '@gabby/types/content';

interface LessonSprintSessionResult {
  questionId: string;
  isSkipped: boolean;
  score: number | null;
  highlightedWordIndices: number[];
}

interface LessonSprintConfigState {
  contentId: string | null;
  questionType: SprintQuestionType | null;
  level: string;
  timeLimitSec: number;
  answerType: SprintAnswerType | null;
  sprintType: string | null;
}

interface LessonSprintState {
  contentName: string | null;
  contentMetadata: MetadataSprint | null;

  // 事前設定〜セッション中を通した唯一の設定ソース（Setup画面が編集し、プレイヤーは参照専用）
  config: LessonSprintConfigState;

  // アクティブセッションの進行状態
  session: {
    isActive: boolean;
    questions: SprintQuestion[];
    currentIndex: number;
    sessionResults: LessonSprintSessionResult[];
    isPaused: boolean;
    pausedSeconds: number; // 一時停止していた合計秒数
    sessionNote: string;
    currentHighlightedWords: number[]; // 現在の問題でクリック中の単語インデックス
  };

  // ─── アクション ───
  setContentName: (name: string | null) => void;
  setContentMetadata: (metadata: MetadataSprint | null) => void;
  setConfig: (config: Partial<LessonSprintConfigState>) => void;
  startSession: (questions: SprintQuestion[]) => void;
  resetStore: () => void;

  toggleWordHighlight: (index: number) => void;
  commitScoreResult: (questionId: string, score: number) => { isLast: boolean };
  commitSkipResult: (questionId: string) => { isLast: boolean };

  setIsPaused: (paused: boolean) => void;
  addPausedSeconds: (seconds: number) => void;
  setSessionNote: (text: string) => void;
}

const initialSession: LessonSprintState['session'] = {
  isActive: false,
  questions: [],
  currentIndex: 0,
  sessionResults: [],
  isPaused: false,
  pausedSeconds: 0,
  sessionNote: '',
  currentHighlightedWords: [],
};

const initialConfig: LessonSprintConfigState = {
  contentId: null,
  questionType: '0',
  level: '1',
  timeLimitSec: 90,
  answerType: '0',
  sprintType: '0',
};

export const useLessonSprintStore = create<LessonSprintState>((set, get) => ({
  contentName: null,
  contentMetadata: null,
  config: initialConfig,
  session: initialSession,

  setContentName: (name) => set({ contentName: name }),
  setContentMetadata: (metadata) => set({ contentMetadata: metadata }),

  setConfig: (inputConfig) => set((state) => ({
    config: { ...state.config, ...inputConfig },
  })),

  startSession: (questions) => set({
    session: {
      ...initialSession,
      isActive: true,
      questions,
    },
  }),

  toggleWordHighlight: (index) => set((state) => {
    const exists = state.session.currentHighlightedWords.includes(index);
    return {
      session: {
        ...state.session,
        currentHighlightedWords: exists
          ? state.session.currentHighlightedWords.filter((i) => i !== index)
          : [...state.session.currentHighlightedWords, index],
      },
    };
  }),

  commitScoreResult: (questionId, score) => {
    const { session } = get();
    const isLast = session.currentIndex >= session.questions.length - 1;

    const newResult: LessonSprintSessionResult = {
      questionId,
      isSkipped: false,
      score,
      highlightedWordIndices: session.currentHighlightedWords,
    };
    const updatedResults = [...session.sessionResults.filter((r) => r.questionId !== questionId), newResult];

    set((state) => ({
      session: {
        ...state.session,
        sessionResults: updatedResults,
        currentIndex: !isLast ? state.session.currentIndex + 1 : state.session.currentIndex,
        currentHighlightedWords: [],
      },
    }));

    return { isLast };
  },

  commitSkipResult: (questionId) => {
    const { session } = get();
    const isLast = session.currentIndex >= session.questions.length - 1;

    const newResult: LessonSprintSessionResult = {
      questionId,
      isSkipped: true,
      score: null,
      highlightedWordIndices: session.currentHighlightedWords,
    };
    const updatedResults = [...session.sessionResults.filter((r) => r.questionId !== questionId), newResult];

    set((state) => ({
      session: {
        ...state.session,
        sessionResults: updatedResults,
        currentIndex: !isLast ? state.session.currentIndex + 1 : state.session.currentIndex,
        currentHighlightedWords: [],
      },
    }));

    return { isLast };
  },

  setIsPaused: (isPaused) => set((state) => ({ session: { ...state.session, isPaused } })),
  addPausedSeconds: (seconds) => set((state) => ({
    session: { ...state.session, pausedSeconds: state.session.pausedSeconds + seconds },
  })),
  setSessionNote: (sessionNote) => set((state) => ({ session: { ...state.session, sessionNote } })),

  resetStore: () => set({
    contentName: null,
    contentMetadata: null,
    config: initialConfig,
    session: initialSession,
  }),
}));
