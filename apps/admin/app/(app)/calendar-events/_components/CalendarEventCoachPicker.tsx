'use client';

import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CalendarEventCoachOption } from '@gabby/types/calendarEvent';

interface CalendarEventCoachPickerProps {
  coaches: CalendarEventCoachOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * グループセッションの担当コーチ選択用ピッカー（複数選択可、上限なし）
 */
export function CalendarEventCoachPicker({ coaches, selectedIds, onChange, disabled }: CalendarEventCoachPickerProps) {
  const coachById = useMemo(() => new Map(coaches.map((c) => [c.coach_id, c])), [coaches]);

  const toggle = (coachId: string) => {
    onChange(selectedIds.includes(coachId) ? selectedIds.filter((id) => id !== coachId) : [...selectedIds, coachId]);
  };

  return (
    <div className="space-y-2">
      <Command className="rounded-xl border border-slate-200">
        <CommandInput placeholder="コーチ名で検索..." className="h-9" disabled={disabled} />
        <CommandList className="max-h-[180px]">
          <CommandEmpty>該当するコーチが見つかりません。</CommandEmpty>
          <CommandGroup>
            {coaches.map((c) => {
              const checked = selectedIds.includes(c.coach_id);
              return (
                <CommandItem
                  key={c.coach_id}
                  value={`${c.user_name || ''} ${c.coach_id}`}
                  onSelect={() => !disabled && toggle(c.coach_id)}
                  className="cursor-pointer"
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{c.user_name || '(名称未設定)'}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedIds.map((id) => {
            const c = coachById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium pl-2.5 pr-1.5 py-1"
              >
                {c?.user_name || '(名称未設定)'}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  disabled={disabled}
                  className="hover:text-indigo-900"
                  aria-label={`${c?.user_name || '(名称未設定)'}を削除`}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
