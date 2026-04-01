// src/app/(app)/student/training/layout.tsx
export default function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // h-screen + overflow-hidden でスクロールを完全に禁止
    // p-2 or p-4 で、モバイル端末の端にカードがくっつきすぎないよう調整
    <div className="h-dvh w-full flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden touch-none selection:bg-indigo-100">
      {children}
    </div>
  );
}