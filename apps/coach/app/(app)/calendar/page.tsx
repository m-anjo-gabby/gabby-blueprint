import { CalendarWorkspace } from './_components/CalendarWorkspace';
import { ScheduleTabs } from '@/components/common/ScheduleTabs';
import { getIncomingRequestsForCoach } from '@/actions/matchingRequestAction';

export default async function CalendarPage() {
  const requests = await getIncomingRequestsForCoach();

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Calendar</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          View your lessons, group sessions, and maintenance notices. You can cancel or reschedule any session before it starts.
        </p>
      </div>

      <ScheduleTabs active="calendar" />

      <div className="max-w-5xl">
        <CalendarWorkspace initialRequests={requests} />
      </div>
    </div>
  );
}
