// apps/student/app/(app)/(shell)/training/performance/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';
import { TrainingSectionNav } from '@/components/shell/TrainingSectionNav';

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContentFrame width={SHELL_CONTENT_WIDTH.trainingPerformance}>
      <TrainingSectionNav />
      {children}
    </ContentFrame>
  );
}
