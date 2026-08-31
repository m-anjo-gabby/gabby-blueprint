import Link from 'next/link';
import { ArrowLeft, VideoOff } from 'lucide-react';
import { getMyLiveSessionRoomAccess } from '@/actions/videoSessionAction';
import { LiveSessionRoomView } from './_components/LiveSessionRoomView';

export default async function LiveSessionRoomPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = await params;
  const result = await getMyLiveSessionRoomAccess(coachId);

  if (!result.success) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4 py-8 px-4">
        <Link
          href="/live-room"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          コーチ選択に戻る
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-[32px] shadow-2xl border border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
            <VideoOff size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">{result.message}</p>
        </div>
      </div>
    );
  }

  return <LiveSessionRoomView access={result.access} />;
}
