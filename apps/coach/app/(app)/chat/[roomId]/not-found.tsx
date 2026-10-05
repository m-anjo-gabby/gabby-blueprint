import { ChatRoomUnavailable } from '@gabby/lib/components/chat/ChatSplitLayout';

/** 開けないルーム（存在しない・退出済み・参加していない）をリンクから開いた場合。チャットの右ペインに案内を出す */
export default function ChatRoomNotFound() {
  return <ChatRoomUnavailable />;
}
