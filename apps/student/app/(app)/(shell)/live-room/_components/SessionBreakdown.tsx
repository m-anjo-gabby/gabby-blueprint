import { cn } from '@/lib/utils';
import type { LiveSessionOverview } from '@gabby/types/matching';

// 「コーチ未選択」の回は、まだ日時の枠自体が無いことを斜線で表す（色はトークンのみ使用）
const HATCHED_CLASS = 'bg-[repeating-linear-gradient(135deg,var(--color-line)_0_3px,transparent_3px_6px)]';

interface Segment {
  key: string;
  label: string;
  count: number;
  className: string;
  /** 0件でも凡例に表示する基本項目か */
  always?: boolean;
}

/**
 * 契約の回数の内訳。未確定の回は、次に取るべき行動が異なるため
 * 「調整中（リクエスト・振替候補の回答待ち）」「未予約（日時をリクエストする）」「コーチ未選択（コーチを選ぶ）」に分ける。
 * 終了した契約では、未確定の回はすべて「未実施」として扱う。
 */
function buildSegments(overview: LiveSessionOverview, isCurrent: boolean, adjustingCount: number): Segment[] {
  const done: Segment[] = [
    { key: 'completed', label: '実施済み', count: overview.completed_count, className: 'bg-brand', always: true },
    { key: 'forfeited', label: '直前キャンセル', count: overview.forfeited_count, className: 'bg-ink-subtle' },
  ];
  if (!isCurrent) {
    return [
      ...done,
      { key: 'missed', label: '未実施', count: overview.scheduled_count + overview.unbooked_count + overview.unassigned_count, className: 'bg-line' },
    ];
  }
  const adjusting = Math.min(adjustingCount, overview.unbooked_count);
  return [
    ...done,
    { key: 'scheduled', label: '予約済み', count: overview.scheduled_count, className: 'bg-brand-300', always: true },
    { key: 'adjusting', label: '調整中', count: adjusting, className: 'bg-brand-100' },
    { key: 'unbooked', label: '未予約', count: overview.unbooked_count - adjusting, className: 'bg-line', always: true },
    { key: 'unassigned', label: 'コーチ未選択', count: overview.unassigned_count, className: HATCHED_CLASS },
  ];
}

interface SessionBreakdownProps {
  overview: LiveSessionOverview;
  /** 現在の契約か（終了した契約では、未確定の回をすべて「未実施」として扱う） */
  isCurrent: boolean;
  /** 予約リクエスト・振替候補の回答待ちの件数（未予約のうち調整中として表示する） */
  adjustingCount: number;
  className?: string;
}

/** 契約の回数の内訳バーと凡例（ライブセッション管理の「契約の状況」と、ホームのライブセッションのカードで共有する） */
export function SessionBreakdown({ overview, isCurrent, adjustingCount, className }: SessionBreakdownProps) {
  const segments = buildSegments(overview, isCurrent, adjustingCount);
  const barTotal = Math.max(overview.total_sessions, segments.reduce((sum, s) => sum + s.count, 0));

  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={segments.map((s) => `${s.label}${s.count}回`).join('、')}
      >
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div key={s.key} className={cn('h-full', s.className)} style={{ width: `${(s.count / barTotal) * 100}%` }} />
          ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {segments
          .filter((s) => s.always || s.count > 0)
          .map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full border border-line', s.className)} />
              <dt className="text-ink-muted">{s.label}</dt>
              <dd className="ml-auto font-semibold text-ink tabular-nums sm:ml-0">{s.count}回</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
