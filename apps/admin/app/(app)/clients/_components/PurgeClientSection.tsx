'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { ClientRecord } from '@gabby/types/client';
import { previewPurgeClient, purgeClient } from '@/actions/adminDataDeletionAction';
import type { PurgeClientCounts } from '@gabby/types/dataDeletion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DangerZone } from '@/components/common/DangerZone';
import { TypedConfirmDialog } from '@/components/common/TypedConfirmDialog';

/** 件数の表に並べる順 */
const COUNT_KEYS: readonly (keyof PurgeClientCounts)[] = [
  'students',
  'coaches',
  'invitations',
  'contracts',
  'licenses',
  'sessions',
  'trainings',
  'chat_messages',
  'notices',
  'calendar_events',
];

const BLOCKERS = [
  'protected_client',
  'has_admin',
  'linked_to_other_client',
  'client_not_found',
  'forbidden',
  'name_mismatch',
] as const;

/**
 * 顧客単位の一括削除（DangerZone）。開いた時に予行で消える件数を取得し、顧客名の入力で確認してから実行する。
 * 規約は docs/DATA-DELETION.md §5。
 */
export function PurgeClientSection({ client, onPurged }: { client: ClientRecord; onPurged: () => void }) {
  const t = useTranslations('clients.purge');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<PurgeClientCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [isPurging, startPurging] = useTransition();

  const toMessage = (code: string) => {
    const known = BLOCKERS.find((c) => c === code);
    return known ? t(`errors.${known}`) : t('errors.unexpected');
  };

  const handleOpen = () => {
    setOpen(true);
    setCounts(null);
    setError(null);
    setBlocked(false);
    startLoading(async () => {
      const result = await previewPurgeClient(client.client_id);
      if (result.success) {
        setCounts(result.counts);
      } else {
        setBlocked(true);
        setError(toMessage(result.errorCode));
      }
    });
  };

  const handlePurge = () => {
    setError(null);
    startPurging(async () => {
      const result = await purgeClient(client.client_id, client.client_name);
      if (result.success) {
        showToast(t('toastPurged'), 'success');
        setOpen(false);
        onPurged();
      } else {
        setError(toMessage(result.errorCode));
      }
    });
  };

  return (
    <>
      <DangerZone
        title={t('title')}
        description={t('description')}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Trash2 size={14} />}
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={handleOpen}
          >
            {t('button')}
          </Button>
        }
      />

      <TypedConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('confirmTitle')}
        expectedText={client.client_name}
        inputLabel={t('inputLabel')}
        confirmLabel={t('button')}
        pending={isPurging}
        error={error}
        disabled={blocked || isLoading || counts === null}
        onConfirm={handlePurge}
      >
        <p>{t('confirmLead')}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-slate-200 p-3 text-xs">
          {COUNT_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{t(`counts.${key}`)}</dt>
              <dd className="font-bold tabular-nums text-slate-800">
                {counts ? counts[key].toLocaleString() : <Skeleton className="h-3.5 w-8" />}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">{t('confirmNote')}</p>
      </TypedConfirmDialog>
    </>
  );
}
