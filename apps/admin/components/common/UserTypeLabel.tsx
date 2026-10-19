'use client';

import { useTranslations } from 'next-intl';
import { userTypeLabelKey } from '@/lib/userTypeLabel';

/** 利用者の区分を表示言語の文言にする関数を返す */
export function useUserTypeLabel(): (type: string | null | undefined) => string {
  const t = useTranslations('common.userType');
  return (type) => t(userTypeLabelKey(type));
}

/** 利用者の区分の文言（表の列等で、翻訳の関数を受け渡さずに出す） */
export function UserTypeLabel({ type }: { type: string | null | undefined }) {
  return useUserTypeLabel()(type);
}
