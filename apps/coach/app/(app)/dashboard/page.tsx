import { getMyProfile } from '@/actions/coachProfileAction';
import { getIncomingRequests } from '@/actions/matchingRequestAction';
import { MATCHING_REQUEST_STATUS } from '@gabby/types/matching';
import DashboardHeader from './_components/DashboardHeader';
import AttentionStrip from './_components/AttentionStrip';
import TodaysSessionsPanel from './_components/TodaysSessionsPanel';
import AssignedStudentsPanel from './_components/AssignedStudentsPanel';

function getGreeting(timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date())
  );
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function Page() {
  const [profile, incomingRequests] = await Promise.all([
    getMyProfile(),
    getIncomingRequests(),
  ]);

  const timezone = profile?.timezone || 'Asia/Tokyo';
  const firstName = profile?.user_name?.split(' ')[0] || 'Coach';
  const pendingRequestCount = incomingRequests.filter((r) => r.status === MATCHING_REQUEST_STATUS.PENDING).length;
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(new Date());

  return (
    <div className="space-y-8">
      <DashboardHeader greeting={getGreeting(timezone)} firstName={firstName} dateLabel={dateLabel} />

      <AttentionStrip pendingRequestCount={pendingRequestCount} />

      <TodaysSessionsPanel />

      <AssignedStudentsPanel />
    </div>
  );
}
