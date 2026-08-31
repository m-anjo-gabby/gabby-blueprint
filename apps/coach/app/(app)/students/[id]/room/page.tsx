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
      <div className="space-y-4">
        <Link
          href={`/students/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Student
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
            <VideoOff size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">{result.message}</p>
        </div>
      </div>
    );
  }

  return <LiveSessionRoom studentId={id} access={result.access} />;
}
