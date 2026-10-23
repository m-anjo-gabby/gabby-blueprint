import { DEFAULT_LESSON_SPRINT_SCORE, LESSON_SPRINT_SCORE_META } from '@gabby/types/lessonSprint';
import { QUESTION_TYPES } from '@gabby/types/sprint';

export interface HelpEntry {
  /** `?` ボタンの読み上げ名 */
  label: string;
  text: string;
}

const scoreLegend = Object.entries(LESSON_SPRINT_SCORE_META)
  .map(([score, meta]) => `${score} ${meta.label}`)
  .join(' · ');

const recommendedTimeLines = Object.values(QUESTION_TYPES)
  .toSorted((a, b) => a.seq_no - b.seq_no)
  .map(({ label, maxLevel, recommendedTimeSec: { upToLv5, fromLv6 } }) =>
    maxLevel <= 5 || upToLv5 === fromLv6
      ? `${label}: ${upToLv5}s`
      : `${label}: up to Lv.5 ${upToLv5}s, Lv.6+ ${fromLv6}s`,
  );

/**
 * 画面の `?` に出す説明。運営向けの操作マニュアル（「表示・用語・指標の意味」）と同じ内容をコーチ向けの英語で短く書く。
 * 画面の動作を変えたら、ここと操作マニュアルを一緒に直す。
 */
export const HELP = {
  contractSessionSummary: {
    label: 'About session counts',
    text: 'Counts only the sessions assigned to you in the current contract. Unbooked = sessions the student has not scheduled yet.',
  },
  sprintProgress: {
    label: 'About Sprint Progress',
    text: 'The highest level the student has acquired in each question type. Stage summarizes all four levels.',
  },
  trainingReports: {
    label: 'About Training Reports',
    text: 'Once finalized, the report cannot be edited. To request a correction, contact the admin team via chat.',
  },
  coachNotes: {
    label: 'About Coach Notes',
    text: 'Only you can see your notes. Notes cannot be edited or deleted.',
  },
  questionType: {
    label: 'About question types',
    text: [
      `${QUESTION_TYPES['0'].label}: answer YES/NO questions in full sentences.`,
      `${QUESTION_TYPES['5'].label}: build a sentence from a base verb, adding one cue at a time.`,
      `${QUESTION_TYPES['4'].label}: change a sentence as each cue instructs.`,
      `${QUESTION_TYPES['6'].label}: answer three questions about a statement.`,
    ].join('\n'),
  },
  timeLimit: {
    label: 'About time limits',
    text: ['Recommended changes with the question type and level:', ...recommendedTimeLines].join('\n'),
  },
  score: {
    label: 'About scoring',
    text: `${scoreLegend}. Unscored questions get ${DEFAULT_LESSON_SPRINT_SCORE} when time runs out.`,
  },
  answerHighlight: {
    label: 'About marking words',
    text: 'Tap a word to mark a pronunciation or missing-word issue.',
  },
  sprintHistoryMonth: {
    label: 'About monthly counts',
    text: 'Monthly counts and averages are based on the sprints loaded so far. Load more to include older ones.',
  },
} as const satisfies Record<string, HelpEntry>;
