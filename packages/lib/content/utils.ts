// packages/lib/content/utils.ts

/**
 * コーチ向け画面で表示する教材名を解決する。
 * content_name_en（任意入力）が未入力の教材は、必須項目であるcontent_name（日本語）にフォールバックする。
 */
export function resolveCoachContentName(content: { content_name: string; content_name_en: string | null }): string {
  return content.content_name_en?.trim() || content.content_name;
}
