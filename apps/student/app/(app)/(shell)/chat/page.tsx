import { ShellPanel, ShellPanelHeader } from '@/components/shell/ShellPanel';
import { ChatRoomList } from './_components/ChatRoomList';

export default function ChatPage() {
  return (
    <ShellPanel>
      <ShellPanelHeader title="チャット" description="担当コーチや運営とのメッセージをまとめて確認できます。" />

      <div className="flex-1 min-h-0 flex flex-col bg-canvas/60">
        <ChatRoomList />
      </div>
    </ShellPanel>
  );
}
