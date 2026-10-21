import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** 基本情報タブの並び（左: 基本情報 / 右: ライセンス・アカウント）。骨組みと共有する */
export const BASIC_TAB_GRID = 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]';

interface DetailSectionProps {
  title: ReactNode;
  description?: ReactNode;
  /** 見出しの右に置く操作 */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** ユーザー詳細の各タブで使う区画（白いカード＋見出し） */
export function DetailSection({ title, description, action, className, children }: DetailSectionProps) {
  return (
    <section className={cn('rounded-lg border border-slate-200 bg-white p-5 shadow-sm', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 区画の骨組み（DetailSection と同じ枠） */
export function DetailSectionSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('rounded-lg border border-slate-200 bg-white p-5 shadow-sm', className)}>
      <Skeleton className="mb-5 h-4 w-32" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
