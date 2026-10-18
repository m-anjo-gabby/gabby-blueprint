'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CONDUCTED_VIA, type ConductedVia } from '@gabby/types/session';

const FLAG_CLASS = 'inline-flex items-center rounded border px-1.5 py-px text-[10px] font-bold';

interface SessionOutcomeFlagsProps {
  conductedVia: ConductedVia | null;
  outcomeMismatch: boolean;
  /** アドミンが修正・確認済み（実施記録の一覧のみ） */
  isCorrected?: boolean;
  className?: string;
}

/** 実施結果の補足の印（外部のZoomで実施・推定と違う結果・アドミンが確認済み）。どれも無ければ何も描かない */
export function SessionOutcomeFlags({
  conductedVia,
  outcomeMismatch,
  isCorrected = false,
  className,
}: SessionOutcomeFlagsProps) {
  const t = useTranslations('liveSessions.outcome');
  const isExternal = conductedVia === CONDUCTED_VIA.EXTERNAL_ZOOM;
  if (!isExternal && !outcomeMismatch && !isCorrected) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {isExternal && (
        <span className={cn(FLAG_CLASS, 'bg-sky-50 text-sky-700 border-sky-200')}>{t('externalBadge')}</span>
      )}
      {outcomeMismatch && (
        <span className={cn(FLAG_CLASS, 'bg-amber-50 text-amber-700 border-amber-200')}>{t('mismatchBadge')}</span>
      )}
      {isCorrected && (
        <span className={cn(FLAG_CLASS, 'bg-slate-50 text-slate-600 border-slate-200')}>{t('correctedBadge')}</span>
      )}
    </div>
  );
}
