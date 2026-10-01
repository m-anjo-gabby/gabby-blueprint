import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardPanelCardProps {
  title: string;
  /** 見出し右側（リンク・件数バッジ等） */
  aside?: ReactNode;
  children: ReactNode;
}

/** ダッシュボードの区画のカード（見出し＋本文）。本番と読み込み中の骨組みで共有する */
export function DashboardPanelCard({ title, aside, children }: DashboardPanelCardProps) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800">{title}</CardTitle>
        {aside}
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

/** 区画内の行（2行の文字＋アイコン、高さ約56px）の骨組み。rows 行分を並べる */
export function PanelRowsSkeleton({ rows = 2, icon = false }: { rows?: number; icon?: boolean }) {
  return (
    <ul aria-hidden className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex h-14 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3">
          {icon && <Skeleton className="size-8 shrink-0 rounded-lg" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40 max-w-full" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        </li>
      ))}
    </ul>
  );
}
