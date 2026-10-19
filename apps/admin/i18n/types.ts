import type { getTranslations } from 'next-intl/server';

/** 名前空間を指定しない翻訳関数（サーバー）。サーバーアクションの補助関数に渡す */
export type ServerTranslator = Awaited<ReturnType<typeof getTranslations<never>>>;

/** 翻訳のキー（「名前空間.キー」の形） */
export type MessageKey = Parameters<ServerTranslator>[0];
