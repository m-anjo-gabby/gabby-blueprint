import { ChatEmptyPane } from '@gabby/lib/components/chat/ChatSplitLayout';

/** ルーム未選択時の右ペイン（2ペイン未満の画面幅では一覧だけを表示するため出ない） */
export default function ChatPage() {
  return <ChatEmptyPane />;
}
