// apps/student/app/(app)/chat/[roomId]/page.tsx
import { notFound } from 'next/navigation';
import { getChatMessages } from '@gabby/lib/chat/actions/messageActions';
import { getChatRoomDetail } from '@gabby/lib/chat/actions/roomActions';
import { ChatTimeline } from '../_components/ChatTimeline';

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

  const { room, members, isMember } = roomDetail.data;

  return (
    <ChatTimeline
      roomId={roomId}
      room={room}
      initialMessages={initialMessages.success ? initialMessages.data : []}
      initialHasMore={initialMessages.success ? initialMessages.hasMore : false}
      isMember={isMember}
      members={members}
    />
  );
}
