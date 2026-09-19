'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocale } from '@/actions/localeAction';
import type { AppLocale } from '@/i18n/request';

const LOCALES: AppLocale[] = ['ja', 'en'];

export default function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: AppLocale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('locale.switchLabel')}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100 hover:bg-slate-100 transition-all outline-none active:scale-95 disabled:opacity-50"
        >
          <Languages size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-600 uppercase">{locale}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-40 p-2 rounded-2xl shadow-xl border-slate-100" align="end">
        {LOCALES.map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={() => handleChange(value)}
            className={`text-xs font-bold cursor-pointer hover:bg-slate-50 ${value === locale ? 'text-indigo-600' : 'text-slate-600'}`}
          >
            {t(`locale.${value === 'ja' ? 'japanese' : 'english'}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
