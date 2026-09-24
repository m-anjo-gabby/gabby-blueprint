// apps/admin/app/(app)/dashboard/_components/ModuleSummaryGrid.tsx
'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

type Props = {
  // ModuleCard は next-intl/server の getTranslations を使う Server Component のため、
  // Client Component であるここでは import・直接レンダリングせず、親（page.tsx）で
  // 描画済みのノードを children として受け取る（Server/Client 境界の合成パターン）
  cards: { key: string; node: ReactNode }[];
};

export default function ModuleSummaryGrid({ cards }: Props) {
  const t = useTranslations('dashboard');

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {cards.map((card, idx) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, ease: 'easeOut' }}
        >
          {card.node}
        </motion.div>
      ))}
    </div>
  );
}