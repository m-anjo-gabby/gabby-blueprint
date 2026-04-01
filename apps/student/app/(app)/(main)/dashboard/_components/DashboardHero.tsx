import { cn } from '@/lib/utils';

export const DashboardHero = () => (
  <div className="flex flex-col items-center text-center py-6 sm:py-10">
    <div className="space-y-6">
      <div className="relative inline-block pb-2">
        <h1 className={cn(
          "text-4xl sm:text-5xl font-[1000] tracking-tighter leading-[1.1]",
          "bg-linear-to-br from-slate-900 via-indigo-950 to-indigo-600",
          "bg-clip-text text-transparent py-1"
        )}> 
          Blueprint English
        </h1>
        <div className="mt-2 h-1 w-32 bg-linear-to-r from-indigo-600 via-blue-500 to-cyan-400 rounded-full mx-auto shadow-[0_4px_12px_-2px_rgba(79,70,229,0.4)]" />
      </div>
      <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.18em] sm:tracking-[0.4em] leading-none opacity-70 whitespace-nowrap">
        Tailor-made for <span className="text-indigo-600/50">Professional ROI</span>
      </p>
    </div>
  </div>
);