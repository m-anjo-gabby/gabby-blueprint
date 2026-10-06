import { getMyAvailability, getMyAvailabilityConfirmedAt } from '@/actions/availabilityAction';
import { getTimezoneList } from '@/actions/coachProfileAction';
import { AvailabilityView } from './_components/AvailabilityView';
import { AvailabilityPageHeader } from '@/components/common/ToolPageSkeletons';

export default async function AvailabilityPage() {
  const [slots, confirmedAt, timezones] = await Promise.all([getMyAvailability(), getMyAvailabilityConfirmedAt(), getTimezoneList()]);

  return (
    <div className="space-y-6">
      <AvailabilityPageHeader />

      <div className="max-w-4xl">
        <AvailabilityView initialSlots={slots} initialConfirmedAt={confirmedAt} timezones={timezones} />
      </div>
    </div>
  );
}
