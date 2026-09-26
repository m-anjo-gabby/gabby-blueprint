import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
  /** 主要指標として大きく表示する */
  emphasis?: boolean;
}

/** 学習記録の数値表示（ラベル・数値・単位） */
export function StatTile({ label, value, unit, icon: Icon, emphasis = false }: StatTileProps) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
      {/* 狭い画面（3列表示等）ではラベルが折り返さないよう、アイコンをラベルの上に置く */}
      <div className="flex flex-col items-start gap-2 text-sm font-medium text-ink-muted sm:flex-row sm:items-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
          <Icon size={16} />
        </span>
        {label}
      </div>
      <p className="mt-3 flex items-baseline gap-1 tabular-nums">
        <span className={cn('font-bold tracking-tight text-ink', emphasis ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{value}</span>
        <span className="text-sm text-ink-muted">{unit}</span>
      </p>
    </div>
  );
}
