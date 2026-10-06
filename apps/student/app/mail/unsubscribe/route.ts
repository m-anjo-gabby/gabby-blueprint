import { createUnsubscribeRoute } from '@gabby/lib/mail/unsubscribe/routeHandler';

/** メールのログイン不要の配信停止（GET: 確認画面 / POST: 停止。proxy で公開ルート） */
export const { GET, POST } = createUnsubscribeRoute('ja');
