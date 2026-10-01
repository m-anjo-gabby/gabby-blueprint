import Link from 'next/link';
import { ChevronLeft, VideoOff } from 'lucide-react';
import { getMyLiveSessionRoomAccess } from '@/actions/videoSessionAction';
import { ImmersiveNotice, noticeActionClass } from '@/components/shell/ImmersiveNotice';
import { LiveSessionRoomView } from './_components/LiveSessionRoomView';

export default async function LiveSessionRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await getMyLiveSessionRoomAccess(sessionId);

  if (!result.success) {
    return (
      <ImmersiveNotice
        tone="error"
        icon={<VideoOff size={24} />}
        title="ライブセッションに参加できません"
        description={result.message}
        actions={
          <Link href="/live-room" className={noticeActionClass('secondary')}>
            <ChevronLeft size={16} strokeWidth={2.5} />
            ライブセッション一覧に戻る
          </Link>
        }
      />
    );
  }

  return <LiveSessionRoomView access={result.access} />;
}
