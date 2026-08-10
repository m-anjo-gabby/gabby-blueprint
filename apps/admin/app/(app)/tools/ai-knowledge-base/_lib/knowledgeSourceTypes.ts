import { BookOpenCheck, GraduationCap, Drama, type LucideIcon } from 'lucide-react';

export interface KnowledgeSourceTypeOption {
  value: string;
  label: string;
  icon: LucideIcon;
  badgeClassName: string;
}

/**
 * com_m_ai_knowledge_base.source_type の選択肢。
 * DB側にCHECK制約はないため、ここに追加するだけで新しい区分（AIコーチ知識・ロールプレイ等）を増やせる。
 */
export const KNOWLEDGE_SOURCE_TYPE_OPTIONS: readonly KnowledgeSourceTypeOption[] = [
  { value: 'help', label: 'ヘルプ記事', icon: BookOpenCheck, badgeClassName: 'bg-indigo-50 text-indigo-600' },
  { value: 'coach', label: 'AIコーチ知識', icon: GraduationCap, badgeClassName: 'bg-emerald-50 text-emerald-600' },
  { value: 'roleplay', label: 'ロールプレイシナリオ', icon: Drama, badgeClassName: 'bg-amber-50 text-amber-600' },
] as const;

export function getKnowledgeSourceTypeOption(value: string): KnowledgeSourceTypeOption | undefined {
  return KNOWLEDGE_SOURCE_TYPE_OPTIONS.find((o) => o.value === value);
}
