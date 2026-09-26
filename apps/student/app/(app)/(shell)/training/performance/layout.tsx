// apps/student/app/(app)/(shell)/training/performance/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="wide">{children}</ContentFrame>;
}
