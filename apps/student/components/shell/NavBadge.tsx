import { cn } from '@/lib/utils';
import type { ShellNavBadge } from './useShellNavBadges';

interface NavBadgeProps {
  badge?: ShellNavBadge;
  className?: string;
}

/** ナビ項目のアイコン右上に重ねる件数バッジ / ドット */
export function NavBadge({ badge, className }: NavBadgeProps) {
  if (badge?.count) {
    return (
      <span
        className={cn(
          'absolute -top-1.5 -right-2 min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-4.5 text-center ring-2 ring-white',
          className
        )}
      >
        {badge.count > 99 ? '99+' : badge.count}
      </span>
    );
  }

  if (badge?.dot) {
    return (
      <span
        className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white', className)}
      />
    );
  }

  return null;
}
