// apps/admin/app/(app)/dashboard/_components/ModuleSummaryGrid.tsx
'use client';

import { motion } from 'framer-motion';
import type { DashboardModuleSummary } from '@/actions/adminDashboardAction';
import ModuleCard from './ModuleCard';

type Props = {
  modules: DashboardModuleSummary[];
};

export default function ModuleSummaryGrid({ modules }: Props) {
  if (modules.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
        表示できる管理項目がありません
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {modules.map((module, idx) => (
        <motion.div
          key={module.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, ease: 'easeOut' }}
        >
          <ModuleCard summary={module} />
        </motion.div>
      ))}
    </div>
  );
}