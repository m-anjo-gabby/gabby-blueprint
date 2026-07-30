// apps/admin/app/(app)/chat/[roomId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getChatMessages } from "@gabby/lib/chat/actions/messageActions";
import { getChatRoomDetail } from "@gabby/lib/chat/actions/roomActions";
import { getUserTypeLabel } from "@gabby/types/user";
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
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/chat"
          className="flex items-center gap-1 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft size={16} />
          チャット一覧へ戻る
        </Link>

        {!isMember && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              査閲モード（非参加ルーム）
            </span>
            <span className="text-slate-500">
              {members.map((m) => `${m.user_name || '（名称未設定）'}（${getUserTypeLabel(m.user_type)}）`).join(' / ')}
            </span>
          </div>
        )}
      </div>

      <ChatTimeline
        roomId={roomId}
        initialMessages={initialMessages.success ? initialMessages.data : []}
        initialHasMore={initialMessages.success ? initialMessages.hasMore : false}
        isMember={isMember}
      />
    </div>
  );
}
