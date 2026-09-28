import { create } from 'zustand';
import { PendingChatAttachment } from '@gabby/types/chat';

export interface ChatDraft {
  text: string;
  attachments: PendingChatAttachment[];
}

const EMPTY_DRAFT: ChatDraft = { text: '', attachments: [] };

interface ChatDraftState {
  /** ルームごとの送信前の下書き（2ペインでルームを切り替えても入力中の内容を失わないよう保持する） */
  drafts: Record<string, ChatDraft>;
  setDraft: (roomId: string, patch: Partial<ChatDraft>) => void;
  clearDraft: (roomId: string) => void;
}

export const useChatDraftStore = create<ChatDraftState>((set) => ({
  drafts: {},

  setDraft: (roomId, patch) =>
    set((state) => ({
      drafts: { ...state.drafts, [roomId]: { ...(state.drafts[roomId] ?? EMPTY_DRAFT), ...patch } },
    })),

  clearDraft: (roomId) =>
    set((state) => {
      if (!(roomId in state.drafts)) return state;
      const rest = { ...state.drafts };
      delete rest[roomId];
      return { drafts: rest };
    }),
}));

/** 指定ルームの下書き（未入力なら空の下書き） */
export function useChatDraft(roomId: string): ChatDraft {
  return useChatDraftStore((state) => state.drafts[roomId] ?? EMPTY_DRAFT);
}
