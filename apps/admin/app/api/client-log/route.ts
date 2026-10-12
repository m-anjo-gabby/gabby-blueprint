import { createClientLogHandler } from '@gabby/lib/logger/clientLogRoute';

// ブラウザのログの受け口（packages/lib/logger/client.ts の clientLogger から送られる）
export const POST = createClientLogHandler('admin');
