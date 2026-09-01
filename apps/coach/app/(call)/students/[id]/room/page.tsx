import Link from 'next/link';
import { ArrowLeft, VideoOff } from 'lucide-react';
import { getLiveSessionRoomAccess } from '@/actions/videoSessionAction';
import { LiveSessionRoom } from './_components/LiveSessionRoom';

export default async function CoachLiveSessionRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getLiveSessionRoomAccess(id);

  if (!result.success) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 border border-slate-800">
          <VideoOff size={22} />
        </div>
        <p className="text-sm font-bold text-slate-400">{result.message}</p>
        <Link
          href={`/students/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Student
        </Link>
      </div>
    );
  }

  return <LiveSessionRoom studentId={id} access={result.access} />;
}
