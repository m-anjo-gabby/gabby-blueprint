// apps/student/app/(app)/notification/layout.tsx

export default function NotificationLayout({
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
