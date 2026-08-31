import Link from 'next/link';
import { ChevronLeft, VideoOff } from 'lucide-react';
import { getMyLiveSessionCoaches } from '@/actions/videoSessionAction';
import { CoachPicker } from './_components/CoachPicker';

export default async function LiveSessionCoachPickerPage() {
  const result = await getMyLiveSessionCoaches();

  if (!result.success) {
    return (
      <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
        <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
            >
              <ChevronLeft size={24} />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">ライブセッション</h1>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center px-6 bg-slate-50/50">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-300 mb-4 border border-rose-100/60">
            <VideoOff size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">{result.message}</p>
        </div>
      </div>
    );
  }

  return <CoachPicker coaches={result.coaches} />;
}
