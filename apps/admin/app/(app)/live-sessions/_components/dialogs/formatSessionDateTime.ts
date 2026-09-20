import { format } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';

export function formatSessionDateTime(iso: string, locale: string = 'ja'): string {
  return format(new Date(iso), 'yyyy/MM/dd (E) HH:mm', { locale: locale === 'en' ? enUS : ja });
}
