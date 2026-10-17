'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';

interface ActiveSwitchFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  /** オンの意味（例: 選択肢に表示する） */
  onText: string;
  /** オフの意味（例: 使用停止。選択肢に表示しない） */
  offText: string;
  /** 確認画面では切り替えずに状態の文言だけを出す */
  readOnly?: boolean;
}

/**
 * マスタの「使用中（is_active）」の切り替え。使用をやめたものは削除せずにオフにする（docs/DATA-DELETION.md）。
 */
export function ActiveSwitchField<T extends FieldValues>({ control, name, label, onText, offText, readOnly }: ActiveSwitchFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="space-y-0.5">
            <FormLabel className="text-xs font-bold text-slate-600">{label}</FormLabel>
            <FormDescription className="text-[11px] text-slate-400">{field.value ? onText : offText}</FormDescription>
          </div>
          {!readOnly && (
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
            </FormControl>
          )}
        </FormItem>
      )}
    />
  );
}
