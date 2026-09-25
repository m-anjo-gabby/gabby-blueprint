import { UserX } from 'lucide-react';
import { getMyLiveSessionTickets, getMySlotStatus, getCoachBrowseList, getCountryList } from '@/actions/matchingAction';
import { CoachMatchingView } from './_components/CoachMatchingView';
import { ShellPanel, ShellPanelHeader } from '@/components/shell/ShellPanel';

export default async function CoachMatchingPage() {
  const tickets = await getMyLiveSessionTickets();

  // ライブセッション付き契約は生徒1人につき同時に1件が前提のため、先頭の1件のみを対象とする
  const ticket = tickets[0];

  if (!ticket) {
    return (
      <ShellPanel>
        <ShellPanelHeader title="専属コーチを探す" back="/live-room" />
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center px-6">
          <div className="w-14 h-14 rounded-control bg-slate-100 flex items-center justify-center text-ink-subtle mb-4">
            <UserX size={22} />
          </div>
          <p className="text-sm font-semibold text-ink-soft">この機能はライブセッション付きプランの方のみご利用いただけます</p>
          <p className="text-xs text-ink-muted mt-1.5">ご不明な点はサポートまでお問い合わせください</p>
        </div>
      </ShellPanel>
    );
  }

  const [slots, coaches, countries] = await Promise.all([
    getMySlotStatus(ticket.ticket_id),
    getCoachBrowseList(),
    getCountryList(),
  ]);

  return <CoachMatchingView ticket={ticket} initialSlots={slots} coaches={coaches} countries={countries} />;
}
