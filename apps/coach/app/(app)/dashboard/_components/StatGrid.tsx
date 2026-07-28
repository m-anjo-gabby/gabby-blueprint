// apps/coach/app/(app)/dashboard/_components/StatGrid.tsx
'use client';

import { motion } from 'framer-motion';
import type { StatEntry } from './statsConfig';
import StatCard from './StatCard';

type Props = {
  stats: readonly StatEntry[];
};

export default function StatGrid({ stats }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((stat, idx) => (
        <motion.div
          key={stat.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, ease: 'easeOut' }}
        >
          <StatCard stat={stat} />
        </motion.div>
      ))}
    </div>
  );
}
