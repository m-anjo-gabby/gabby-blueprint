import type { SprintQuestion } from '@gabby/types/sprint';
import type { SpeakingPrompt } from '../audio/core/flow';

export type SprintPromptKey = 'statement' | 'question';

/**
 * スプリントの発話前に再生する音声（基本文 → 質問文/指示文）。
 * 基本文の無い種別（Speed 等）は質問文だけ。質問文は文が無くても表示切替のために含める。
 */
export function getSprintQuestionPrompts(
  question: Pick<SprintQuestion, 'statement_en' | 'statement_voice' | 'question_en' | 'question_voice'>,
): SpeakingPrompt<SprintPromptKey>[] {
  const prompts: SpeakingPrompt<SprintPromptKey>[] = [];
  if (question.statement_en) {
    prompts.push({ key: 'statement', text: question.statement_en, audioPath: question.statement_voice });
  }
  prompts.push({ key: 'question', text: question.question_en, audioPath: question.question_voice });
  return prompts;
}
