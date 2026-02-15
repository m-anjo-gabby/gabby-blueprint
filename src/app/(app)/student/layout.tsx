// src/app/(app)/student/layout.tsx
export default function StudentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 全体共通の背景色やフォント、Provider類があればここで包む
    <div className="min-h-screen bg-[#f5f5f7] text-slate-900">
      {children}
    </div>
  );
}