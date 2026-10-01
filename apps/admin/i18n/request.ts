// apps/admin/i18n/request.ts
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const SUPPORTED_LOCALES = ['ja', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
// 言語切替の Cookie が無い場合（初回アクセス・ログイン前など）は、日本人・英語ネイティブ双方が読める英語で表示する
export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export function resolveLocale(raw: string | undefined): AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as AppLocale)
    : DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
