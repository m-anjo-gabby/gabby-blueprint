import type { SessionListItem } from '@gabby/types/session';
import { Skeleton } from '@/components/ui/skeleton';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { cn } from '@/lib/utils';
import { CoachAvatar } from './CoachAvatar';

type HeadingSize = 'md' | 'lg';

/**
 * 大きさごとの見た目（本番と骨組みで共有する）。アイコンは日時＋コーチ名の2段の高さに合わせる。
 * md: ホームのライブセッションのカード / lg: ライブセッション管理の次回のセッション
 */
const HEADING_SIZE = {
  md: {
    avatar: 48,
    avatarSkeleton: 'size-12',
    dateRow: 'gap-x-2',
    date: 'text-lg',
    time: 'text-base',
    dateRowSkeleton: 'h-7',
    dateSkeleton: 'h-5 w-32',
    timeSkeleton: 'h-4 w-24',
  },
  lg: {
    avatar: 56,
    avatarSkeleton: 'size-14',
    dateRow: 'gap-x-2.5',
    date: 'text-xl sm:text-2xl',
    time: 'text-base sm:text-lg',
    dateRowSkeleton: 'h-7 sm:h-8',
    dateSkeleton: 'h-5 w-36 sm:h-6',
    timeSkeleton: 'h-4 w-24',
  },
} as const satisfies Record<HeadingSize, Record<string, string | number>>;

interface SessionCoachHeadingProps {
  session: SessionListItem;
  timezone: string;
  size: HeadingSize;
  className?: string;
}

/**
 * ライブセッションの「次回のセッション」の見出し。コーチの顔写真を大きく出し、右に上段の日時・下段のコーチ名を並べる
 * （ライブセッション管理の予定一覧と同じ並び）。ホームとライブセッション管理で共有する。
 */
export function SessionCoachHeading({ session, timezone, size, className }: SessionCoachHeadingProps) {
  const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);
  const styles = HEADING_SIZE[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <CoachAvatar iconPath={session.counterpart_icon_path} size={styles.avatar} />
      <div className="min-w-0 flex-1">
        <p className={cn('flex flex-wrap items-baseline font-bold text-ink tabular-nums', styles.dateRow)}>
          <span className={styles.date}>{slot.date}</span>
          <span className={styles.time}>{slot.time}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-muted">{session.counterpart_name} コーチ</p>
      </div>
    </div>
  );
}

/** 「次回のセッション」の見出しの骨組み（本番と同じアイコンの大きさ・2段の高さで描く） */
export function SessionCoachHeadingSkeleton({ size, className }: { size: HeadingSize; className?: string }) {
  const styles = HEADING_SIZE[size];

  return (
    <div aria-hidden className={cn('flex items-center gap-3', className)}>
      <Skeleton className={cn('shrink-0 rounded-full', styles.avatarSkeleton)} />
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center', styles.dateRow, styles.dateRowSkeleton)}>
          <Skeleton className={styles.dateSkeleton} />
          <Skeleton className={styles.timeSkeleton} />
        </div>
        <div className="mt-0.5 flex h-5 items-center">
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
    </div>
  );
}
