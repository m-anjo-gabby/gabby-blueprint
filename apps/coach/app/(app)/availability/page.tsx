import { getMyAvailability } from '@/actions/availabilityAction';
import { AvailabilityView } from './_components/AvailabilityView';

export default async function AvailabilityPage() {
  const slots = await getMyAvailability();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Weekly Availability</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Set the days and times you are available for live sessions. Students will request a fixed weekly slot within these hours.
        </p>
      </div>

      <AvailabilityView initialSlots={slots} />
    </div>
  );
}
