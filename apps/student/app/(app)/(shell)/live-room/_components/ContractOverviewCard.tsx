'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { convertWeeklyTimeZone, formatDateTimeByZone } from '@gabby/lib/date/date';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { LiveSessionContractSummary, LiveSessionOverview, SlotStatusItem } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { ShellSectionTitle } from '@/components/shell/ShellPage';
import { SessionBreakdown } from './SessionBreakdown';

function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timezone }).format(new Date(iso));
}

/** コマの行の操作（マッチング画面へ。承認待ちの申請の確認・取り下げ、未選択のコマのコーチ選び） */
function SlotLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-control px-2 py-1.5 text-xs font-bold text-brand hover:bg-brand-soft"
    >
      {label}
      <ChevronRight size={14} aria-hidden="true" />
    </Link>
  );
}

function SlotRow({
  slot,
  weeklyFrequency,
  timezone,
  matchingHref,
}: {
  slot: SlotStatusItem;
  weeklyFrequency: number;
  timezone: string;
  /** マッチング画面（この契約）。有効な契約のときだけ渡し、承認待ち・未選択のコマに操作を出す */
  matchingHref: string | null;
}) {
  const schedule =
    slot.day_of_week !== null && slot.start_time && slot.end_time
      ? convertWeeklyTimeZone(
          { day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.end_time },
          slot.schedule_timezone || 'Asia/Tokyo',
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
            <p className="truncate text-xs text-ink-muted">{slot.coach_name} コーチ</p>
            {/* 回答待ちの状態は名前と別の行にし、狭い画面でも省略されないようにする */}
            {slot.status === 'pending' && (
              <p className="mt-0.5 text-[11px] font-bold text-amber-700">
                回答待ち{slot.expires_at && `（期限 ${formatDateTimeByZone(slot.expires_at, timezone, false)}）`}
              </p>
            )}
          </>
        )}
      </div>
      {matchingHref && slot.status === 'pending' && <SlotLink href={matchingHref} label="確認・取り下げ" />}
      {matchingHref && slot.status === 'unmatched' && <SlotLink href={matchingHref} label="コーチを選ぶ" />}
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

/** 契約の状況（プラン名・期間・週の回数、回数の内訳バーと、コマごとの担当コーチ・曜日時刻） */
export function ContractOverviewCard({ contract, overview, timezone, adjustingCount }: Props) {
  return (
    <div>
      <ShellSectionTitle>{contract.is_current ? '契約の状況' : '契約の実績'}</ShellSectionTitle>
      <section className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-4">
          <p className="min-w-0 text-base font-bold text-ink">{contract.plan_name}</p>
          <p className="text-xs text-ink-muted tabular-nums">
            {formatContractDate(contract.start_date, timezone)}〜{formatContractDate(contract.end_date, timezone)}・週{overview.weekly_frequency}回
          </p>
        </div>

        <p className="mt-4 flex items-baseline gap-2 font-bold text-ink tabular-nums">
          <span className="text-sm text-ink-muted">実施済み</span>
          <span className="text-2xl">{overview.completed_count}</span>
          <span className="text-sm text-ink-muted">/ {overview.total_sessions}回</span>
        </p>

        <SessionBreakdown overview={overview} isCurrent={contract.is_current} adjustingCount={adjustingCount} className="mt-4" />

        {/* 有効な契約（現在の契約・開始前の次の契約）は、コマごとの担当と、承認待ち・未選択のコマのマッチング画面への導線を出す */}
        {contract.is_active && overview.slots.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {overview.slots.map((slot) => (
              <SlotRow
                key={slot.slot_no}
                slot={slot}
                weeklyFrequency={overview.weekly_frequency}
                timezone={timezone}
                matchingHref={`/coach-matching?contract=${contract.ticket_id}`}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
