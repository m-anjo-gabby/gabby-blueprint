import { getMyAvailability } from '@/actions/availabilityAction';
import { getTimezoneList } from '@/actions/coachProfileAction';
import { AvailabilityView } from './_components/AvailabilityView';

export default async function AvailabilityPage() {
  const [slots, timezones] = await Promise.all([getMyAvailability(), getTimezoneList()]);

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Weekly Availability</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Set the days and times you are available for live sessions. Students will request a fixed weekly slot within these hours.
        </p>
      </div>

      <div className="max-w-4xl mx-auto">
        <AvailabilityView initialSlots={slots} timezones={timezones} />
      </div>
    </div>
  );
}
