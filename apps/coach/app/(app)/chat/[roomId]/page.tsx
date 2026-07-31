// apps/coach/app/(app)/chat/[roomId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getChatMessages } from "@gabby/lib/chat/actions/messageActions";
import { getChatRoomDetail } from "@gabby/lib/chat/actions/roomActions";
import { ChatTimeline } from "../_components/ChatTimeline";

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const [roomDetail, initialMessages] = await Promise.all([
    getChatRoomDetail(roomId),
    getChatMessages({ roomId }),
  ]);

  if (!roomDetail.success || !roomDetail.data) {
    notFound();
  }

  const { members, isMember } = roomDetail.data;

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
        isMember={isMember}
        members={members}
      />
    </div>
  );
}
