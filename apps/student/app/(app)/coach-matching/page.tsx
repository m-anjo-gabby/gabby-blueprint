import { UserX } from 'lucide-react';
import { getMyLiveSessionTickets, getMySlotStatus, getCoachBrowseList, getCountryList } from '@/actions/matchingAction';
import { CoachMatchingView } from './_components/CoachMatchingView';

export default async function CoachMatchingPage() {
  const tickets = await getMyLiveSessionTickets();

  // ライブセッション付き契約は生徒1人につき同時に1件が前提のため、先頭の1件のみを対象とする
  const ticket = tickets[0];

  if (!ticket) {
    return (
      <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
            <UserX size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">この機能はライブセッション付きプランの方のみご利用いただけます</p>
          <p className="text-[11px] text-slate-400 mt-1.5">ご不明な点はサポートまでお問い合わせください</p>
        </div>
      </div>
    );
  }

  const [slots, coaches, countries] = await Promise.all([
    getMySlotStatus(ticket.ticket_id),
    getCoachBrowseList(),
    getCountryList(),
  ]);

  return <CoachMatchingView ticket={ticket} initialSlots={slots} coaches={coaches} countries={countries} />;
}
