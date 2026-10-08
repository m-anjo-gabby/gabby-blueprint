'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
 * グループセッションの担当コーチ選択用ピッカー（複数選択可、上限なし）。
 * cmdk は表示直後に先頭の候補を自動で選び、その候補が見えるよう scrollIntoView で親のスクロール領域まで動かすため、
 * ダイアログの下の方に置くとダイアログが少しスクロールした状態で開いてしまう。
 * 候補の選択（ハイライト）を制御し、利用者がキーボード・マウスで操作するまでは何も選ばない（自動のスクロールが起きない）。
 */
export function CalendarEventCoachPicker({ coaches, selectedIds, onChange, disabled }: CalendarEventCoachPickerProps) {
  const t = useTranslations('calendarEvents.coachPicker');
  const coachById = useMemo(() => new Map(coaches.map((c) => [c.coach_id, c])), [coaches]);
  const [highlighted, setHighlighted] = useState('');
  const interactedRef = useRef(false);
  const markInteracted = () => {
    interactedRef.current = true;
  };

  const toggle = (coachId: string) => {
    onChange(selectedIds.includes(coachId) ? selectedIds.filter((id) => id !== coachId) : [...selectedIds, coachId]);
  };

  return (
    <div className="space-y-2">
      <Command
        className="rounded-xl border border-slate-200"
        value={highlighted}
        onValueChange={(value) => {
          if (interactedRef.current) setHighlighted(value);
        }}
        onKeyDownCapture={markInteracted}
        onPointerMoveCapture={markInteracted}
      >
        <CommandInput placeholder={t('searchPlaceholder')} className="h-9" disabled={disabled} />
        <CommandList className="max-h-[180px]">
          <CommandEmpty>{t('empty')}</CommandEmpty>
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
                  <span className="truncate">{c.user_name || t('unnamed')}</span>
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
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-strong text-xs font-medium pl-2.5 pr-1.5 py-1"
              >
                {c?.user_name || t('unnamed')}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  disabled={disabled}
                  className="hover:text-brand-900"
                  aria-label={t('removeAriaLabel', { name: c?.user_name || t('unnamed') })}
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
