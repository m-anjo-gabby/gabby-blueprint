// apps/coach/app/(app)/chat/page.tsx
import { ChatRoomList } from "./_components/ChatRoomList";

export default function ChatPage() {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Chat</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          1-on-1 conversations with students. New rooms are created by admins only.
        </p>
      </div>

      <ChatRoomList />
    </div>
  );
}
