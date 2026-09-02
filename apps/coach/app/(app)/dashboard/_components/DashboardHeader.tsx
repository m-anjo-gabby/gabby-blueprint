// apps/coach/app/(app)/dashboard/_components/DashboardHeader.tsx
interface Props {
  greeting: string;
  firstName: string;
  dateLabel: string;
}

export default function DashboardHeader({ greeting, firstName, dateLabel }: Props) {
  return (
    <div>
      <p className="text-xs font-bold text-indigo-500">{dateLabel}</p>
      <h1 className="text-xl font-bold text-slate-800 mt-0.5">
        {greeting}, {firstName}
      </h1>
      <p className="text-xs text-slate-500 mt-1">
        Here&apos;s what needs your attention today.
      </p>
    </div>
  );
}
