'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, resolveLocale, type AppLocale } from '@/i18n/request';

export async function setLocale(locale: AppLocale) {
  const safeLocale: AppLocale = resolveLocale(locale);

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, safeLocale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
