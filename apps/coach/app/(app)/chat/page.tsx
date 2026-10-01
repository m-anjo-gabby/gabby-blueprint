import { ChatEmptyPane } from '@gabby/lib/components/chat/ChatSplitLayout';

/** Right pane while no room is selected (hidden on narrow screens, where only the room list is shown) */
export default function ChatPage() {
  return <ChatEmptyPane />;
}
