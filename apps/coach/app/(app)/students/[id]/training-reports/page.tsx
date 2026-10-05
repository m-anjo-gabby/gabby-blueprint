import { notFound } from 'next/navigation';
import { getStudentOverview, getStudentLiveSessionContracts, getContractTrainingReports } from '@/actions/studentAction';
import { TrainingReportHistoryList } from './_components/TrainingReportHistoryList';
import { StudentChildPageHeader } from '../../_components/StudentsSkeletons';

export default async function TrainingReportHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const [contracts, reports] = await Promise.all([
    getStudentLiveSessionContracts(id),
    getContractTrainingReports(id),
  ]);

  return (
    <div className="space-y-6">
      <StudentChildPageHeader studentId={id} title="Training Reports" studentName={overview.profile.user_name} className="max-w-2xl" />

      <div className="max-w-2xl mx-auto">
        <TrainingReportHistoryList studentId={id} contracts={contracts} initialReports={reports} />
      </div>
    </div>
  );
}
