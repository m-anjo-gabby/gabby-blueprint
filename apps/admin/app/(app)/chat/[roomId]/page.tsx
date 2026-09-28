// apps/admin/app/(app)/chat/[roomId]/page.tsx
import { notFound } from "next/navigation";
import { getChatMessages } from "@gabby/lib/chat/actions/messageActions";
import { getChatRoomDetail } from "@gabby/lib/chat/actions/roomActions";
import { AdminChatRoom } from "../_components/AdminChatRoom";

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

  return (
    <AdminChatRoom
      roomId={roomId}
      {...roomDetail.data}
      initialMessages={initialMessages.success ? initialMessages.data : []}
      initialHasMore={initialMessages.success ? initialMessages.hasMore : false}
    />
  );
}
