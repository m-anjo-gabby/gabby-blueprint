import { CalendarClock } from 'lucide-react';
import { getMyProfile } from '@/actions/coachProfileAction';
import { getIncomingRequestsForCoach } from '@/actions/matchingRequestAction';
import { Section } from '@/components/common/Section';
import { isPendingCoachIncomingRequest } from '@gabby/types/coachInbox';
import DashboardHeader from './_components/DashboardHeader';
import AttentionStrip from './_components/AttentionStrip';
import TodaysSessionsPanel from './_components/TodaysSessionsPanel';
import SessionTasksPanel from './_components/SessionTasksPanel';

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
    getIncomingRequestsForCoach(),
  ]);

  const timezone = profile?.timezone || 'Asia/Tokyo';
  const firstName = profile?.user_name?.split(' ')[0] || 'Coach';
  const pendingRequestCount = incomingRequests.filter(isPendingCoachIncomingRequest).length;
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(new Date());

  return (
    <div className="space-y-8">
      <DashboardHeader greeting={getGreeting(timezone)} firstName={firstName} dateLabel={dateLabel} />

      <AttentionStrip pendingRequestCount={pendingRequestCount} />

      <Section label="Sessions" icon={CalendarClock}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TodaysSessionsPanel />
          <SessionTasksPanel />
        </div>
      </Section>
    </div>
  );
}
