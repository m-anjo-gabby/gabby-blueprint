export default function MonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Allow for wider content, similar to dashboard, but still centered
    <div className="min-h-screen w-full flex flex-col items-center p-4 sm:p-6 bg-slate-50/60">
      {children}
    </div>
  );
}