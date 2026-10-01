// apps/coach/app/(app)/dashboard/_components/DashboardHeader.tsx
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  greeting: string;
  firstName: string;
  dateLabel: string;
}

const SUBTITLE = <p className="text-xs text-slate-500 mt-1">Here&apos;s what needs your attention today.</p>;

export default function DashboardHeader({ greeting, firstName, dateLabel }: Props) {
  return (
    <div>
      <p className="text-xs font-bold text-brand-500">{dateLabel}</p>
      <h1 className="text-xl font-bold text-slate-800 mt-0.5">
        {greeting}, {firstName}
      </h1>
      {SUBTITLE}
    </div>
  );
}

/** 読み込み中の骨組み（日付・あいさつは骨組み、案内文は本物） */
export function DashboardHeaderSkeleton() {
  return (
    <div>
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="mt-0.5 flex h-7 items-center">
        <Skeleton className="h-5 w-56 max-w-full" />
      </div>
      {SUBTITLE}
    </div>
  );
}
