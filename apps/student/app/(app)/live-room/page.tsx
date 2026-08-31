import { VideoOff } from 'lucide-react';
import { getMyLiveSessionCoaches } from '@/actions/videoSessionAction';
import { CoachPicker } from './_components/CoachPicker';

export default async function LiveSessionCoachPickerPage() {
  const result = await getMyLiveSessionCoaches();

  if (!result.success) {
    return (
      <div className="flex flex-col w-full max-w-2xl h-full mx-auto bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
            <VideoOff size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">{result.message}</p>
        </div>
      </div>
    );
  }

  return <CoachPicker coaches={result.coaches} />;
}
