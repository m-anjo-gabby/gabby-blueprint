'use client';

import { useMyChatRooms } from '@gabby/lib/components/chat/useMyChatRooms';
import { ChatSplitLayout } from '@gabby/lib/components/chat/ChatSplitLayout';
import { ChatRoomListPane } from '@gabby/lib/components/chat/ChatRoomListPane';
import { CHAT_LABELS, CHAT_SPLIT_BREAKPOINT } from '@/constants/chat';

/** チャットの2ペイン（左: ルーム一覧 / 右: 選択中のルーム）。モバイルでは端まで広げ、sm 以上はカードとして浮かせる */
export function StudentChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatSplitLayout
      labels={CHAT_LABELS}
      breakpoint={CHAT_SPLIT_BREAKPOINT}
      list={<StudentChatRoomList />}
      className="sm:rounded-card sm:border sm:border-line sm:shadow-xs"
    >
      {children}
    </ChatSplitLayout>
  );
}

function StudentChatRoomList() {
  const { rooms, isLoading } = useMyChatRooms();
  return <ChatRoomListPane rooms={rooms} isLoading={isLoading} />;
}
