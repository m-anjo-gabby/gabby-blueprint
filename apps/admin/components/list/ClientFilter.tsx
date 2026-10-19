'use client';

import { useTranslations } from 'next-intl';
import type { ClientOption } from '@gabby/types/client';
import { SearchableSelect } from '@/components/common/SearchableSelect';

interface ClientFilterProps {
  clients: ClientOption[];
  /** 選択中の顧客ID（空文字 = すべての顧客） */
  value: string;
  onChange: (clientId: string) => void;
}

/** 一覧の顧客での絞り込み（顧客名で探して選ぶ）。ListToolbar の children に置く */
export function ClientFilter({ clients, value, onChange }: ClientFilterProps) {
  const t = useTranslations('common.clientFilter');
  return (
    <SearchableSelect
      options={clients.map((c) => ({ value: c.client_id, label: c.client_name }))}
      value={value}
      onChange={onChange}
      placeholder={t('allClients')}
      searchPlaceholder={t('searchPlaceholder')}
      emptyMessage={t('emptyMessage')}
      className="h-9 w-52 shrink-0 rounded-md font-normal"
    />
  );
}
