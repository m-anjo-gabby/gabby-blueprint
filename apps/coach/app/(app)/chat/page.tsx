import { ChatEmptyPane } from '@gabby/lib/components/chat/ChatSplitLayout';

/** ルームを選んでいない間の右ペイン（狭い画面ではルームの一覧だけを出すため隠れる） */
export default function ChatPage() {
  return <ChatEmptyPane />;
}
