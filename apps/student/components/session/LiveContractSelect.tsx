'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import type { LiveSessionContractSummary } from '@gabby/types/matching';

/** 契約の日付（例: 2026/10/1） */
export function formatContractDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timezone }).format(new Date(iso));
}

/** 契約期間（例: 2026/10/1〜2026/12/31） */
export function formatContractPeriod(contract: LiveSessionContractSummary, timezone: string): string {
  return `${formatContractDate(contract.start_date, timezone)}〜${formatContractDate(contract.end_date, timezone)}`;
}

/** 契約の表示名（期間＋現在・次の契約の区別。過去の契約は期間だけ） */
function formatContractLabel(contract: LiveSessionContractSummary, timezone: string): string {
  const period = formatContractPeriod(contract, timezone);
  if (contract.is_current) return `現在の契約：${period}`;
  if (contract.is_active) return `次の契約：${period}`;
  return period;
}

interface LiveContractSelectProps {
  contracts: LiveSessionContractSummary[];
  selectedTicketId: string;
  onChange: (ticketId: string) => void;
}

/**
 * ライブセッション付き契約の切替（契約を2件以上持つ場合だけ置く）。
 * 契約の識別は ticket_id（URL の ?contract=）。ライブセッションホーム・専属コーチを探すで共有する。
 */
export function LiveContractSelect({ contracts, selectedTicketId, onChange }: LiveContractSelectProps) {
  const timezone = useTimezone();
  const selected = contracts.find((c) => c.ticket_id === selectedTicketId);

  return (
    <Select value={selectedTicketId} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full rounded-control border-line bg-surface text-sm sm:w-80" aria-label="表示する契約">
        {/* 選択肢はポータル内にあり開くまで描画されないため、選択中の表示は明示的に渡す */}
        <SelectValue>{selected ? formatContractLabel(selected, timezone) : null}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {contracts.map((c) => (
          <SelectItem key={c.ticket_id} value={c.ticket_id}>
            {formatContractLabel(c, timezone)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
