import { ShellPageHeader } from '@/components/shell/ShellPage';
import { ChatRoomList } from './_components/ChatRoomList';

export default function ChatPage() {
  return (
    <>
      <ShellPageHeader title="チャット" description="担当コーチや運営とのメッセージをまとめて確認できます。" />

      <ChatRoomList />
    </>
  );
}
