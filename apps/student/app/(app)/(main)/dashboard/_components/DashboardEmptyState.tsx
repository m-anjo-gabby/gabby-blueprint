'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

export const DashboardEmptyState = ({ 
  icon: Icon, 
  title, 
  description,
  className 
}: DashboardEmptyStateProps) => (
  <motion.div 
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn(
      "w-full p-10 rounded-[32px] border-2 border-dashed border-slate-200 bg-slate-50/30 flex flex-col items-center justify-center text-center",
      className
    )}
  >
    <div className="p-3 bg-white rounded-2xl shadow-sm text-slate-300 mb-4">
      <Icon size={24} />
    </div>
    <p className="text-sm font-bold text-slate-500 tracking-tight">
      {title}
    </p>
    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-1.5">
      {description}
    </p>
  </motion.div>
);