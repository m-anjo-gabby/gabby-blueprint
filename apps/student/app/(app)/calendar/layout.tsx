// apps/student/app/(app)/calendar/layout.tsx

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-full flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden touch-none selection:bg-indigo-100">
      {children}
    </div>
  );
}
