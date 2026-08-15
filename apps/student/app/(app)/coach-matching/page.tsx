import { UserX } from 'lucide-react';
import { getMyLiveSessionTickets, getMySlotStatus, getCoachBrowseList } from '@/actions/matchingAction';
import { CoachMatchingView } from './_components/CoachMatchingView';

export default async function CoachMatchingPage() {
  const tickets = await getMyLiveSessionTickets();

  // ライブセッション付き契約は生徒1人につき同時に1件が前提のため、先頭の1件のみを対象とする
  const ticket = tickets[0];

  if (!ticket) {
    return (
      <div className="max-w-2xl mx-auto px-2 py-10">
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
            <UserX size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">この機能はライブセッション付きプランの方のみご利用いただけます</p>
          <p className="text-[11px] text-slate-400 mt-1.5">ご不明な点はサポートまでお問い合わせください</p>
        </div>
      </div>
    );
  }

  const [slots, coaches] = await Promise.all([
    getMySlotStatus(ticket.ticket_id),
    getCoachBrowseList(),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-2 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">専属コーチを探す</h1>
        <p className="text-[13px] text-slate-500">
          週{ticket.weekly_frequency}回のレッスン枠ごとにコーチをリクエストできます。コーチが承認すると、契約期間分のレッスンが自動で予約されます。
        </p>
      </div>

      <CoachMatchingView ticket={ticket} initialSlots={slots} coaches={coaches} />
    </div>
  );
}
