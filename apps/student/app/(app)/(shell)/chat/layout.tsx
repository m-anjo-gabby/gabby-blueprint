// apps/student/app/(app)/chat/layout.tsx
export default function ChatLayout({
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
