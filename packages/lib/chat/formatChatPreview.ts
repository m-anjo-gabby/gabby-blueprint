import { ChatMessage } from '@gabby/types/chat';

/**
 * ルーム一覧のプレビュー表示文言（アプリごとに日本語/英語で注入する）
 */
export interface ChatPreviewLabels {
  deleted: string;
  photo: string;
  file: string;
  noMessages: string;
}

/**
 * ルーム一覧の最新メッセージプレビューを組み立てる。
 * IMAGE/FILEメッセージは添付ラベル（+ コメントがあれば併記）で表示し、
 * message列の生データ（Storageパス等）がそのまま表示されるのを防ぐ。
 */
export function getChatMessagePreviewText(message: ChatMessage | null, labels: ChatPreviewLabels): string {
  if (!message) return labels.noMessages;
  if (message.deleted_at) return labels.deleted;

  if (message.attachments.length > 0) {
    const attachmentLabel = message.message_type === 'IMAGE' ? labels.photo : labels.file;
    return message.message ? `${attachmentLabel} · ${message.message}` : attachmentLabel;
  }

  return message.message || labels.noMessages;
}
