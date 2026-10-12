import { getHomeCalendarEvents } from '@/actions/calendarEventAction';
import { HomeEventCard } from './HomeEventCard';

/** ホームのグループセッションの区画（サーバーで取得し、ページ側の Suspense で遅れて表示する） */
export async function HomeEventSection() {
  const events = await getHomeCalendarEvents();
  return <HomeEventCard events={events} />;
}
