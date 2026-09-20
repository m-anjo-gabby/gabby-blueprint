import { BookOpenCheck, GraduationCap, Drama, type LucideIcon } from 'lucide-react';
import type { useTranslations } from 'next-intl';

export interface KnowledgeSourceTypeOption {
  value: string;
  label: string;
  icon: LucideIcon;
  badgeClassName: string;
}

type SourceTypeT = ReturnType<typeof useTranslations<'tools.aiKnowledgeBase.sourceTypes'>>;

/**
 * com_m_ai_knowledge_base.source_type の選択肢。
 * DB側にCHECK制約はないため、ここに追加するだけで新しい区分（AIコーチ知識・ロールプレイ等）を増やせる。
 */
export function getKnowledgeSourceTypeOptions(t: SourceTypeT): readonly KnowledgeSourceTypeOption[] {
  return [
    { value: 'help', label: t('help'), icon: BookOpenCheck, badgeClassName: 'bg-indigo-50 text-indigo-600' },
    { value: 'coach', label: t('coach'), icon: GraduationCap, badgeClassName: 'bg-emerald-50 text-emerald-600' },
    { value: 'roleplay', label: t('roleplay'), icon: Drama, badgeClassName: 'bg-amber-50 text-amber-600' },
  ] as const;
}

export function getKnowledgeSourceTypeOption(
  value: string,
  t: SourceTypeT
): KnowledgeSourceTypeOption | undefined {
  return getKnowledgeSourceTypeOptions(t).find((o) => o.value === value);
}
