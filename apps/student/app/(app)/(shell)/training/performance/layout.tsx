// apps/student/app/(app)/(shell)/training/performance/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.trainingPerformance}>{children}</ContentFrame>;
}
