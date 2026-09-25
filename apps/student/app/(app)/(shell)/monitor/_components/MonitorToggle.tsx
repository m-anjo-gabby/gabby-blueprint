'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export const MonitorToggle: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const includeMonitor = searchParams.get('includeMonitor') === 'true';

  const handleToggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (!includeMonitor) {
      params.set('includeMonitor', 'true');
    } else {
      params.delete('includeMonitor');
    }
    router.push(`/monitor?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 bg-slate-100/80 border border-slate-200/40 rounded-xl h-[38px] px-3 shadow-2xs select-none shrink-0">
      <span className="text-xs font-black text-slate-600 tracking-tight flex items-center gap-1.5">
        <Users size={12} className={cn("transition-colors", includeMonitor ? "text-indigo-500" : "text-slate-400")} />
        モニターを含める
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={includeMonitor}
        onClick={handleToggle}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
          includeMonitor ? "bg-indigo-600" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
            includeMonitor ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
};