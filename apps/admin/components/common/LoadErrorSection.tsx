'use client';

import { useTranslations } from 'next-intl';
import { SectionLoadError } from '@gabby/lib/components/common/SectionLoadError';

/** 一覧・画面の主な内容を読み込めなかった区画の表示（admin の文言で SectionLoadError を出す） */
export function LoadErrorSection({ className }: { className?: string }) {
  const t = useTranslations('common');
  return <SectionLoadError message={t('errors.loadFailed')} retryLabel={t('reload')} className={className} />;
}
