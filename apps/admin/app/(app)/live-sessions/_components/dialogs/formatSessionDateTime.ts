import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export function formatSessionDateTime(iso: string): string {
  return format(new Date(iso), 'yyyy/MM/dd (E) HH:mm', { locale: ja });
}
