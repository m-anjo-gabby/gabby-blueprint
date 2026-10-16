import type { Metadata } from 'next';
import Image from 'next/image';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { formatUtcOffset } from '@gabby/lib/date/timezone';
import { WEB_TRIAL_LICENSE_DAYS } from '@gabby/types/trialApplication';
import { TrialApplicationForm, type TrialTimezoneOption } from './_components/TrialApplicationForm';

export const metadata: Metadata = {
  title: '無料体験のお申し込み | Gabby Blueprint',
};

const logger = createLogger('student');

/** タイムゾーンの選択肢（未ログインでも開く画面のため、マスタはサーバーで取得する。オフセットはサーバーで付けて表示を揃える） */
async function getTimezoneOptions(): Promise<TrialTimezoneOption[]> {
  const { data, error } = await createAdminClient()
    .from('com_m_timezone')
    .select('timezone, display_name_ja')
    .eq('delete_flg', '0')
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

/** Webトライアルの申込（ログイン不要の公開画面。コーポレートサイトからリンクする） */
export default async function TrialPage() {
  const timezones = await getTimezoneOptions();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="rounded-panel border border-line bg-surface p-6 shadow-sm md:p-10">
          <header className="mb-8 space-y-4 text-center">
            {/* ロゴはログイン画面（LoginForm）と同じ画像 */}
            <div className="flex justify-center">
              <Image src="/logo-01.png" alt="Gabby Blueprint" width={320} height={85} className="h-auto w-auto max-w-56 md:max-w-64" priority />
            </div>
            <h1 className="text-2xl font-bold text-ink">無料体験のお申し込み</h1>
            <p className="text-sm leading-relaxed text-ink-muted">
              {`お申し込み後、パスワードを設定した日から${WEB_TRIAL_LICENSE_DAYS}日間、アプリのトレーニングとコーチとのライブセッション1回をお試しいただけます。`}
            </p>
          </header>
          <TrialApplicationForm timezones={timezones} turnstileSiteKey={turnstileSiteKey} />
        </div>
        <p className="text-center text-[11px] text-ink-subtle">© {new Date().getFullYear()} Gabby All rights reserved.</p>
      </div>
    </div>
  );
}
