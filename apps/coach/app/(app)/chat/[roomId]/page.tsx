// apps/coach/app/(app)/chat/[roomId]/page.tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getChatMessages } from "@gabby/lib/chat/actions/messageActions";
import { ChatTimeline } from "../_components/ChatTimeline";

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const initialMessages = await getChatMessages({ roomId });

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-2">
        <Link
          href="/chat"
          className="flex items-center gap-1 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft size={16} />
          Back to Chat
        </Link>
      </div>

      <ChatTimeline
        roomId={roomId}
        initialMessages={initialMessages.success ? initialMessages.data : []}
        initialHasMore={initialMessages.success ? initialMessages.hasMore : false}
      />
    </div>
  );
}
