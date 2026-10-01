import { getMyAvailability } from '@/actions/availabilityAction';
import { getTimezoneList } from '@/actions/coachProfileAction';
import { AvailabilityView } from './_components/AvailabilityView';
import { AvailabilityPageHeader } from '@/components/common/ToolPageSkeletons';

export default async function AvailabilityPage() {
  const [slots, timezones] = await Promise.all([getMyAvailability(), getTimezoneList()]);

  return (
    <div className="space-y-6">
      <AvailabilityPageHeader />

      <div className="max-w-4xl">
        <AvailabilityView initialSlots={slots} timezones={timezones} />
      </div>
    </div>
  );
}
