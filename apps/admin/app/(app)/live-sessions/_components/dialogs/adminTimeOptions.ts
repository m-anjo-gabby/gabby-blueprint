import { generateLessonStartTimeOptions } from '@gabby/lib/date/date';

// セッションは30分単位の枠のため、時間選択もこの粒度に揃える（振替・予約・直接マッチングの3ダイアログで共有）
export const ADMIN_TIME_OPTIONS = generateLessonStartTimeOptions('00:00', '23:59');
