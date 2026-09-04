import { VideoOff } from 'lucide-react';
import { getLiveSessionRoomAccess } from '@/actions/videoSessionAction';
import { LiveSessionRoom } from './_components/LiveSessionRoom';
import { CloseTabButton } from './_components/CloseTabButton';

export default async function CoachLiveSessionRoomPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await getLiveSessionRoomAccess(sessionId);

  if (!result.success) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
          <VideoOff size={22} />
        </div>
        <p className="text-sm font-bold text-slate-500">{result.message}</p>
        <CloseTabButton />
      </div>
    );
  }

  return <LiveSessionRoom access={result.access} />;
}
