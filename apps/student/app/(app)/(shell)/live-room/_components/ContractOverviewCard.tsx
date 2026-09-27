'use client';

import { cn } from '@/lib/utils';
import { convertWeeklyTimeZone } from '@gabby/lib/date/date';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { LiveSessionContractSummary, LiveSessionOverview, SlotStatusItem } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';

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

function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timezone }).format(new Date(iso));
}

function SlotRow({ slot, weeklyFrequency, timezone }: { slot: SlotStatusItem; weeklyFrequency: number; timezone: string }) {
  const schedule =
    slot.day_of_week !== null && slot.start_time && slot.end_time
      ? convertWeeklyTimeZone(
          { day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.end_time },
          slot.coach_timezone || 'Asia/Tokyo',
          timezone
        )
      : null;
  const scheduleLabel = schedule
    ? `毎週${DAY_OF_WEEK_LABEL_JA[schedule.day_of_week as DayOfWeek]} ${schedule.start_time}〜${schedule.end_time}`
    : null;

  return (
    <li className="flex items-center gap-3 py-2.5">
      {weeklyFrequency > 1 && <span className="w-12 shrink-0 text-xs text-ink-muted">コマ{slot.slot_no}</span>}
      <div className="min-w-0 flex-1">
        {slot.status === 'unmatched' ? (
          <p className="text-sm text-ink-muted">専属コーチ未選択</p>
        ) : (
          <>
            <p className="truncate text-sm font-semibold text-ink tabular-nums">{scheduleLabel}</p>
            <p className="truncate text-xs text-ink-muted">
              {slot.coach_name} コーチ{slot.status === 'pending' && '（承認待ち）'}
            </p>
          </>
        )}
      </div>
    </li>
  );
}

interface Props {
  contract: LiveSessionContractSummary;
  overview: LiveSessionOverview;
  timezone: string;
  /** 予約リクエスト・振替候補の回答待ちの件数（未予約のうち調整中として表示する） */
  adjustingCount: number;
}

/** 契約の状況（回数の内訳バーと、コマごとの担当コーチ・曜日時刻） */
export function ContractOverviewCard({ contract, overview, timezone, adjustingCount }: Props) {
  const segments = buildSegments(overview, contract.is_current, adjustingCount);
  const barTotal = Math.max(overview.total_sessions, segments.reduce((sum, s) => sum + s.count, 0));

  return (
    <section className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{contract.is_current ? '契約の状況' : '契約の実績'}</h2>
          <p className="mt-1 text-xs text-ink-muted tabular-nums">
            {formatContractDate(contract.start_date, timezone)}〜{formatContractDate(contract.end_date, timezone)}・週{overview.weekly_frequency}回
          </p>
        </div>
        <p className="shrink-0 text-right font-bold text-ink tabular-nums">
          <span className="text-2xl">{overview.completed_count}</span>
          <span className="text-sm text-ink-muted"> / {overview.total_sessions}回</span>
        </p>
      </div>

      <div
        className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-line"
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

      {contract.is_current && overview.slots.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {overview.slots.map((slot) => (
            <SlotRow key={slot.slot_no} slot={slot} weeklyFrequency={overview.weekly_frequency} timezone={timezone} />
          ))}
        </ul>
      )}
    </section>
  );
}
