// packages/lib/ai/services/translation.ts

import { generateObject } from 'ai';
import { z } from 'zod';
import { buildTranslationPrompt, TRANSLATION_SYSTEM_PROMPT } from '../prompts/translation';
import { DEFAULT_TRANSLATION_MODEL, google } from '../providers/google';

const translationResultSchema = z.object({
  translation: z.string(),
  explanation: z.string().optional(),
});

export type TranslationResult = z.infer<typeof translationResultSchema>;

export interface TranslateEnglishParams {
  /** 翻訳対象の英文 */
  text: string;
  /** 学習者向けの補足説明（表現解説等）を含めるか。デフォルトtrue */
  includeExplanation?: boolean;
}

/**
 * 英文をSpeechSuperの評価結果等から取り出し、学習者向けに日本語訳＋解説を生成する。
 */
export async function translateEnglish({
  text,
  includeExplanation = true,
}: TranslateEnglishParams): Promise<TranslationResult> {
  const { object } = await generateObject({
    model: google(DEFAULT_TRANSLATION_MODEL),
    schema: translationResultSchema,
    system: TRANSLATION_SYSTEM_PROMPT,
    prompt: buildTranslationPrompt(text, includeExplanation),
  });

  return object;
}
