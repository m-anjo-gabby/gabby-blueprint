'use client';

import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { ChatSplitLayout } from '@gabby/lib/components/chat/ChatSplitLayout';
import { ChatRoomListPane } from '@gabby/lib/components/chat/ChatRoomListPane';
import { CHAT_LABELS, CHAT_SPLIT_BREAKPOINT } from '@/constants/chat';

/** Chat 2-pane frame: room list on the left, the selected room (children) on the right */
export function CoachChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatSplitLayout
      labels={CHAT_LABELS}
      breakpoint={CHAT_SPLIT_BREAKPOINT}
      list={<CoachChatRoomList />}
      className="rounded-2xl border border-line shadow-sm"
    >
      {children}
    </ChatSplitLayout>
  );
}

// 生徒の所属（顧客）はコーチに見せないため、顧客での絞り込みは置かない
function CoachChatRoomList() {
  const rooms = useChatStore((state) => state.rooms);
  const isLoading = useChatStore((state) => state.isLoading);
  return <ChatRoomListPane rooms={rooms} isLoading={isLoading} />;
}
