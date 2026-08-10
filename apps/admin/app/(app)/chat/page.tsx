// apps/admin/app/(app)/chat/page.tsx
import { ChatRoomList } from "./_components/ChatRoomList";

export default function ChatPage() {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">チャット</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            コーチ・生徒との1対1チャット、またはグループチャットです。ルームの新規作成はAdminのみ行えます。
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatRoomList />
      </div>
    </div>
  );
}
