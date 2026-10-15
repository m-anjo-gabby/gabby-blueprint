import type { LegalName, LegalNameLocale } from '@gabby/types/userLegal';

/**
 * 正式な氏名を書面の言語に合わせて並べる。
 *   ja: 「姓 名」（例: 山田 太郎）
 *   en: 「名 姓」。ローマ字表記があればそれを使う（例: Taro Yamada）
 * 未登録（null）の場合は null（呼び出し側で画面の名前等に置き換える）。
 * トレーニングレポートの RPC（get_training_report_data）も日本語の並べ方で同じ組み立てをしている。
 */
export function formatLegalName(name: LegalName | null, locale: LegalNameLocale): string | null {
  if (!name) return null;
  if (locale === 'ja') return joinName(name.last_name, name.first_name);
  if (name.first_name_latin) return joinName(name.first_name_latin, name.last_name_latin);
  return joinName(name.first_name, name.last_name);
}

function joinName(...parts: (string | null)[]): string | null {
  const joined = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return joined || null;
}
