import { CalendarBoard } from './_components/CalendarBoard';
import { CalendarPageHeader } from './_components/CalendarSkeleton';

export default function CalendarPage() {
  return (
    <>
      <CalendarPageHeader />

      <CalendarBoard />
    </>
  );
}
