'use client';

import Link from 'next/link';
import { Calendar, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'calendar', label: 'Calendar', href: '/calendar', icon: Calendar },
  { key: 'availability', label: 'Availability', href: '/availability', icon: CalendarClock },
] as const;

interface ScheduleTabsProps {
  active: (typeof TABS)[number]['key'];
}

/**
 * Calendar / Availability間をページ遷移なしの体感で行き来できるようにする共有タブ。
 * 各ページはServer Componentのままデータ取得を維持したいので、実体はページ遷移する
 * リンクだが、見た目上はセグメントコントロールとして提示する。
 */
export function ScheduleTabs({ active }: ScheduleTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
              isActive ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
