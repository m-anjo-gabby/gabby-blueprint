import Link from 'next/link';
import { ArrowLeft, FileText, MessagesSquare, StickyNote, Video, Zap, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * 生徒概要の骨組み。カードの見出し（アイコン・タイトル）は本物を描き、中身だけを骨組みにする。
 * page.tsx の各カードの Suspense の fallback と、画面遷移中の骨組み（loading.tsx）で共有する。
 * カードの見出し・並びを変えたら OVERVIEW_CARDS も合わせて直す。
 */

interface OverviewCardDef {
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  rows: number;
}

export const OVERVIEW_CARDS = {
  liveSessions: { title: 'Live Sessions', icon: Video, iconClassName: 'text-brand-500', rows: 5 },
  lessonSprint: { title: 'Live Sprint', icon: Zap, iconClassName: 'fill-current text-amber-400', rows: 3 },
  dialoguePractice: { title: 'Dialogue Practice', icon: MessagesSquare, iconClassName: 'text-slate-400', rows: 3 },
  coachNotes: { title: 'Coach Notes', icon: StickyNote, iconClassName: 'text-slate-400', rows: 3 },
  trainingReports: { title: 'Training Reports', icon: FileText, iconClassName: 'text-slate-400', rows: 3 },
} satisfies Record<string, OverviewCardDef>;

export type OverviewCardKey = keyof typeof OVERVIEW_CARDS;

/** 生徒概要の1枚分のカードの骨組み（見出しは本物、行は骨組み） */
export function OverviewCardSkeleton({ card }: { card: OverviewCardKey }) {
  const { title, icon: Icon, iconClassName, rows }: OverviewCardDef = OVERVIEW_CARDS[card];
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Icon size={14} className={iconClassName} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent aria-hidden className="pt-2 space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </CardContent>
    </Card>
  );
}

/** 生徒概要の見出し（戻るリンクは本物。生徒名・契約・スプリントの進捗を骨組み） */
export function OverviewHeaderSkeleton() {
  return (
    <div className="space-y-4">
      <Link
        href="/students"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Students
      </Link>
      <div aria-hidden className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-col lg:grid lg:grid-cols-[4fr_6fr] lg:items-start gap-5 lg:gap-10">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 shrink-0 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <div className="lg:border-l lg:border-slate-100 lg:pl-8">
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 生徒概要のカードの並び（page.tsx と骨組みで共有する） */
export const OVERVIEW_GRID_CLASS = 'grid grid-cols-1 lg:grid-cols-2 gap-5';

/** 生徒概要の画面全体の骨組み */
export function StudentOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <OverviewHeaderSkeleton />
      <div className={OVERVIEW_GRID_CLASS}>
        {(Object.keys(OVERVIEW_CARDS) as OverviewCardKey[]).map((card) => (
          <OverviewCardSkeleton key={card} card={card} />
        ))}
      </div>
    </div>
  );
}
