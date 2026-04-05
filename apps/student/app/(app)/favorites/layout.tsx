// apps/student/app/(app)/(main)/favorites/layout.tsx

export default function PanelLockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // w-full を確保しつつ、画面全体でレイアウトを制御
    <div className="h-dvh w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-[#f5f5f7]">
      {children}
    </div>
  );
}