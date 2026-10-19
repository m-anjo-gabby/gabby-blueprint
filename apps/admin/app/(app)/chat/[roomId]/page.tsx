// apps/admin/app/(app)/chat/[roomId]/page.tsx
import { notFound } from 'next/navigation';
import { getChatMessages } from '@gabby/lib/chat/actions/messageActions';
import { getChatRoomDetail } from '@gabby/lib/chat/actions/roomActions';
import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { AdminChatRoom } from '../_components/AdminChatRoom';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const [roomDetail, initialMessages, profile] = await Promise.all([
    getChatRoomDetail(roomId),
    getChatMessages({ roomId }),
    getMyProfileCore(),
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
      viewerTimezone={profile.success ? profile.profile.timezone : DEFAULT_TIMEZONE}
    />
  );
}
