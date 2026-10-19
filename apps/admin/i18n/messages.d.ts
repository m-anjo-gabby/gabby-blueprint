// 翻訳のキーを型で検査する。ja.json を正とし、en.json は同じキーを持つ（testing/unit の admin-messages.test で確かめる）
import type messages from '../messages/ja.json';

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
  }
}
