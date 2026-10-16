'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserDetailPath, getUserDetailTabFromPath, type UserDetailTab } from '../_lib/tabs';

interface Props {
  userId: string;
  tabs: UserDetailTab[];
}

/** ユーザー詳細のタブ（各タブは子ルート。URL で直接開ける） */
export function UserDetailTabs({ userId, tabs }: Props) {
  const t = useTranslations('users.detail.tabs');
  const active = getUserDetailTabFromPath(usePathname());

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => (
        <Link
          key={tab}
          href={getUserDetailPath(userId, tab)}
          aria-current={tab === active ? 'page' : undefined}
          className={cn(
            'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold transition-colors',
            tab === active ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}

/** タブの並びの骨組み（ユーザーの種別が決まるまでタブの数が分からないため） */
export function UserDetailTabsSkeleton() {
  return (
    <div className="flex gap-4 border-b border-slate-200 pb-2.5 pt-1.5">
      {[64, 72, 56].map((width) => (
        <Skeleton key={width} className="h-5" style={{ width }} />
      ))}
    </div>
  );
}
