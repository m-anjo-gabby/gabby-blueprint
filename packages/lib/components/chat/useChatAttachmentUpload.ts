'use client';

import { useCallback, useState } from 'react';
import { CHAT_ATTACHMENT_MAX_SIZE } from '@gabby/types/chat';
import { uploadChatAttachment } from '../../chat/actions/attachmentActions';
import { useToast } from '../../hooks/useToast';
import { useChatDraftStore } from '../../stores/useChatDraftStore';
import type { ChatLabels } from './ChatUiContext';

/**
 * 貼り付けた画像（スクリーンショット等）はファイル名が "image.png" 等の汎用名になるため、
 * 受け取った側で区別できるよう日時入りの名前に付け替える
 */
function normalizePastedFileName(file: File): File {
  if (!/^image\.\w+$/i.test(file.name)) return file;
  const ext = file.name.split('.').pop() ?? 'png';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return new File([file], `pasted-image-${stamp}.${ext}`, { type: file.type });
}

/**
 * チャットの添付ファイルのアップロード（クリップアイコン・貼り付け・ドラッグ＆ドロップ共通）。
 * アップロードしたファイルは即送信せず、ルームの下書き（送信前の添付）に加える。送信は入力欄の送信ボタンで行う。
 */
export function useChatAttachmentUpload(roomId: string, labels: ChatLabels) {
  const { showToast } = useToast();
  const setDraft = useChatDraftStore((state) => state.setDraft);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsUploading(true);
      try {
        for (const original of files) {
          const file = normalizePastedFileName(original);
          if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
            showToast(labels.fileTooLarge(file.name), 'error');
            continue;
          }

          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await uploadChatAttachment(roomId, formData);
          if (!uploadRes.success) {
            const message =
              uploadRes.errorCode === 'file_too_large'
                ? labels.fileTooLarge(file.name)
                : labels.uploadFailed(file.name);
            showToast(message, 'error');
            continue;
          }
          const uploaded = uploadRes.attachment;
          // アップロード中にルームを切り替えても、そのルームの下書きへ追加する
          const current = useChatDraftStore.getState().drafts[roomId]?.attachments ?? [];
          setDraft(roomId, { attachments: [...current, uploaded] });
        }
      } finally {
        setIsUploading(false);
      }
    },
    [roomId, labels, setDraft, showToast],
  );

  return { isUploading, addFiles };
}
