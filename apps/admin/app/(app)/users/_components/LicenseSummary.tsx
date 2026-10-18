import { useTranslations } from 'next-intl';
import { Calendar, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRecord } from '@gabby/types/user';

type LicenseUser = Pick<
  UserRecord,
  'license_state' | 'contract_name' | 'plan_name' | 'license_start_date' | 'license_end_date'
>;

interface Props {
  user: LicenseUser;
  /** 一覧用の詰めた表示（契約名を省略し、期間は終了日だけにする） */
  compact?: boolean;
}

/** 生徒の現在のライセンス（契約名・状態・期間）。一覧のライセンス欄と詳細画面で共通 */
export function LicenseSummary({ user, compact = false }: Props) {
  const t = useTranslations('users.table');
  const { license_state, contract_name, plan_name, license_start_date, license_end_date } = user;

  if (license_state === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-400">
        <ShieldAlert size={12} /> {t('licenseNotSet')}
      </span>
    );
  }

  const stateLabel =
    license_state === 'future' ? t('licenseFuture') : license_state === 'expired' ? t('licenseExpired') : null;
  const endDate = license_end_date?.split('T')[0] ?? '';
  const period = compact ? endDate : `${license_start_date?.split('T')[0] ?? ''} 〜 ${endDate}`;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          title={contract_name ?? undefined}
          className={cn(
            'min-w-0 truncate text-xs font-bold',
            compact && 'max-w-44',
            license_state === 'future'
              ? 'text-blue-600'
              : license_state === 'expired'
                ? 'text-rose-500'
                : 'text-slate-700',
          )}
        >
          {contract_name}
        </span>
        {stateLabel && (
          <span
            className={cn(
              'shrink-0 whitespace-nowrap text-[11px] font-bold',
              license_state === 'future' ? 'text-blue-500' : 'text-rose-500',
            )}
          >
            {stateLabel}
          </span>
        )}
      </div>
      {!compact && plan_name && <span className="text-xs text-slate-500">{plan_name}</span>}
      <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-400">
        <Calendar size={10} /> {period}
      </span>
    </div>
  );
}
