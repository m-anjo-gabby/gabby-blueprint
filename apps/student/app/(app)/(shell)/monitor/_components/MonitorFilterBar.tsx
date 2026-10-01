'use client';

import { useMemo, useState } from 'react';
import { Check, Download, Search, Users, X } from 'lucide-react';
import type { MonitorUser } from '@/actions/monitorAction';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { MonitorUserName } from './MonitorParts';

/** 指定できる期間の上限（日数。約半年） */
const MAX_RANGE_DAYS = 186;
const DAY_MS = 1000 * 60 * 60 * 24;

type RangeError = 'reverse' | 'exceeded' | null;

function validateRange(start: string, end: string): RangeError {
  if (!start || !end || start > end) return 'reverse';
  return (new Date(end).getTime() - new Date(start).getTime()) / DAY_MS > MAX_RANGE_DAYS ? 'exceeded' : null;
}

const RANGE_ERROR_MESSAGE: Record<Exclude<RangeError, null>, string> = {
  reverse: '開始日には終了日より前の日付を指定してください',
  exceeded: '期間は最大半年まで指定できます',
};

const FIELD_LABEL_CLASS = 'mb-1.5 block text-xs font-semibold text-ink-muted';
const CONTROL_CLASS = 'h-10 rounded-control border-line bg-surface text-sm shadow-none';

interface MonitorFilterBarProps {
  users: MonitorUser[];
  monitorIds: Set<string>;
  /** 表示中の期間（YYYY-MM-DD）。変わったら入力欄も合わせるため、呼び出し側で key に含める */
  startDate: string;
  endDate: string;
  selectedUserIds: string[];
  onApply: (patch: { startDate?: string; endDate?: string; userIds?: string[] }) => void;
  isPending: boolean;
  onExport: () => void;
  exportDisabled: boolean;
}

/** 履歴画面（単語ドリル・スプリント）の条件（期間・受講生の絞り込み）とCSV出力 */
export function MonitorFilterBar({
  users,
  monitorIds,
  startDate,
  endDate,
  selectedUserIds,
  onApply,
  isPending,
  onExport,
  exportDisabled,
}: MonitorFilterBarProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const rangeError = validateRange(localStart, localEnd);
  const isRangeChanged = localStart !== startDate || localEnd !== endDate;

  const selectedUsers = users.filter((u) => selectedUserIds.includes(u.id));
  const setUserIds = (userIds: string[]) => onApply({ userIds });

  return (
    <div className="mb-4 space-y-3 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        {/* 期間 */}
        <div className="min-w-0">
          <span className={FIELD_LABEL_CLASS}>対象期間（最大半年）</span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={localStart}
              onChange={(e) => setLocalStart(e.target.value)}
              aria-label="開始日"
              aria-invalid={rangeError !== null}
              className={cn(CONTROL_CLASS, 'w-auto', rangeError && 'border-rose-400')}
            />
            <span className="text-sm text-ink-muted">〜</span>
            <Input
              type="date"
              value={localEnd}
              onChange={(e) => setLocalEnd(e.target.value)}
              aria-label="終了日"
              aria-invalid={rangeError !== null}
              className={cn(CONTROL_CLASS, 'w-auto', rangeError && 'border-rose-400')}
            />
            <Button
              onClick={() => onApply({ startDate: localStart, endDate: localEnd })}
              disabled={rangeError !== null || !isRangeChanged}
              pending={isPending && isRangeChanged}
              icon={<Search />}
              className="h-10 rounded-control px-4 font-semibold shadow-none"
            >
              表示
            </Button>
          </div>
        </div>

        {/* 受講生 */}
        <div className="min-w-0">
          <span className={FIELD_LABEL_CLASS}>受講生</span>
          <MonitorUserPicker
            users={users}
            monitorIds={monitorIds}
            selectedIds={selectedUserIds}
            onChange={setUserIds}
            disabled={isPending}
          />
        </div>

        <Button
          variant="outline"
          onClick={onExport}
          disabled={exportDisabled}
          icon={<Download />}
          className={cn(CONTROL_CLASS, 'px-4 font-semibold text-ink-soft lg:ml-auto')}
        >
          CSVエクスポート
        </Button>
      </div>

      {rangeError && (
        <p role="alert" className="text-xs font-semibold text-rose-600">
          {RANGE_ERROR_MESSAGE[rangeError]}
        </p>
      )}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs font-semibold text-ink-muted">絞り込み中</span>
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-soft py-1 pr-1 pl-3 text-xs font-semibold text-brand"
            >
              {u.user_name || u.email}
              <button
                type="button"
                onClick={() => setUserIds(selectedUserIds.filter((id) => id !== u.id))}
                disabled={isPending}
                aria-label={`${u.user_name || u.email} の絞り込みを解除`}
                className="rounded-full p-0.5 transition-colors hover:bg-brand-100 disabled:opacity-40"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUserIds([])}
            disabled={isPending}
            className="rounded-control text-xs font-semibold text-brand hover:bg-brand-soft"
          >
            すべて解除
          </Button>
        </div>
      )}
    </div>
  );
}

interface MonitorUserPickerProps {
  users: MonitorUser[];
  monitorIds: Set<string>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}

/** 受講生の複数選択（名前・メールで検索） */
function MonitorUserPicker({ users, monitorIds, selectedIds, onChange, disabled }: MonitorUserPickerProps) {
  const [query, setQuery] = useState('');

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.user_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, query]);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id]);

  return (
    <Popover onOpenChange={(open) => !open && setQuery('')}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          icon={<Users />}
          className={cn(CONTROL_CLASS, 'w-full justify-start px-4 font-semibold text-ink-soft sm:w-64')}
        >
          {selectedIds.length > 0 ? `${selectedIds.length}名を選択中` : '全員'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 rounded-control p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・メールで検索"
          aria-label="受講生を検索"
          className="mb-2 h-9 rounded-control border-line text-sm shadow-none"
        />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-ink-muted">該当する受講生が見つかりません</p>
          ) : (
            filteredUsers.map((u) => {
              const isSelected = selectedIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggle(u.id)}
                  disabled={disabled}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-sm transition-colors disabled:opacity-60',
                    isSelected ? 'bg-brand-soft' : 'hover:bg-canvas'
                  )}
                >
                  <span className="min-w-0">
                    <MonitorUserName name={u.user_name} isMonitor={monitorIds.has(u.id)} />
                    <span className="block truncate text-xs text-ink-muted">{u.email}</span>
                  </span>
                  {isSelected && <Check size={16} className="shrink-0 text-brand" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
