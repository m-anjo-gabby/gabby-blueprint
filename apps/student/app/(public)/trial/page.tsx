import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { formatUtcOffset } from '@gabby/lib/date/timezone';
import { TrialApplicationForm, type TrialTimezoneOption } from './_components/TrialApplicationForm';
import { TrialSummary } from './_components/TrialSummary';

const logger = createLogger('student');

/** タイムゾーンの選択肢（未ログインでも開く画面のため、マスタはサーバーで取得する。オフセットはサーバーで付けて表示を揃える） */
async function getTimezoneOptions(): Promise<TrialTimezoneOption[]> {
  const { data, error } = await createAdminClient()
    .from('com_m_timezone')
    .select('timezone, display_name_ja')
    .eq('is_active', true)
    .order('sort_no', { ascending: true });
  if (error) {
    logger.error('trial:get_timezones_failed', error.message, { err: error });
    return [{ value: 'Asia/Tokyo', label: '日本' }];
  }
  return (data ?? []).map((tz) => {
    const offset = formatUtcOffset(tz.timezone);
    return { value: tz.timezone, label: offset ? `${tz.display_name_ja}（${offset}）` : tz.display_name_ja };
  });
}

/** Webトライアルの申込（ログイン不要の公開画面。コーポレートサイトから別タブのリンクで開く）。受付後は /trial/complete へ移る */
export default async function TrialPage() {
  const timezones = await getTimezoneOptions();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  return <TrialApplicationForm timezones={timezones} turnstileSiteKey={turnstileSiteKey} intro={<TrialSummary />} />;
}
