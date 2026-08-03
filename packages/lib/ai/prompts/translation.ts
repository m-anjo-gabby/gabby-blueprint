// packages/lib/ai/prompts/translation.ts

/**
 * 英文翻訳・学習補助用システムプロンプト。
 * SpeechSuperの英文アドバイス翻訳や、学習者向けの英文解説に利用する。
 */
export const TRANSLATION_SYSTEM_PROMPT = `You are a professional English-to-Japanese translator supporting English learners.
Translate the given English text into natural, easy-to-understand Japanese.
When asked to explain, keep the explanation short, concrete, and useful for a Japanese-speaking English learner.`;

export function buildTranslationPrompt(text: string, includeExplanation: boolean): string {
  if (!includeExplanation) {
    return `Translate the following English text into natural Japanese. Return only the translation.

English text:
${text}`;
  }

  return `Translate the following English text into natural Japanese, and add a short supplementary explanation for a Japanese-speaking English learner (e.g. notable expressions, nuance, or grammar points worth knowing).

English text:
${text}`;
}
