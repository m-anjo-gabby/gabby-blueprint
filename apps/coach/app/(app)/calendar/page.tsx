import { CalendarBoard } from './_components/CalendarBoard';

export default function CalendarPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Calendar</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          View your upcoming lessons. You can cancel or reschedule any session before it starts.
        </p>
      </div>

      <CalendarBoard />
    </div>
  );
}
