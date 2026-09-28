'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SearchableSelect } from './SearchableSelect';
import type { ClientOption } from '@gabby/types/client';

interface ClientFilterProps {
  clients: ClientOption[];
  className?: string;
}

/**
 * 顧客絞り込みフィルタ（URLクエリパラメータ `clientId` と同期）。
 * 一覧系ページ（ユーザー管理・契約管理等）の検索セクションから共通利用する。
 */
export function ClientFilter({ clients, className }: ClientFilterProps) {
  const t = useTranslations('common.clientFilter');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentClientId = searchParams.get('clientId') || '';

  const handleChange = (clientId: string) => {
    const params = new URLSearchParams(searchParams);
    if (clientId) {
      params.set('clientId', clientId);
    } else {
      params.delete('clientId');
    }

    // 検索条件（顧客）が変わったので、強制的に1ページ目に戻す
    params.delete('page');

    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <SearchableSelect
      options={clients.map((c) => ({ value: c.client_id, label: c.client_name }))}
      value={currentClientId}
      onChange={handleChange}
      placeholder={t('allClients')}
      searchPlaceholder={t('searchPlaceholder')}
      emptyMessage={t('emptyMessage')}
      className={className ?? 'h-9 w-52 shrink-0 rounded-md font-normal'}
    />
  );
}
