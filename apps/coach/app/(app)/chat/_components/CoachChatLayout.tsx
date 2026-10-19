'use client';

import { ChatRoomListPane } from '@gabby/lib/components/chat/ChatRoomListPane';
import { ChatSplitLayout } from '@gabby/lib/components/chat/ChatSplitLayout';
import { useMyChatRooms } from '@gabby/lib/components/chat/useMyChatRooms';
import { CHAT_LABELS, CHAT_SPLIT_BREAKPOINT } from '@/constants/chat';

/** チャットの2ペインの枠。左にルームの一覧、右に選んだルーム（children） */
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
  const { rooms, isLoading } = useMyChatRooms();
  return <ChatRoomListPane rooms={rooms} isLoading={isLoading} />;
}
