// apps/student/app/(app)/(shell)/monitor/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="full">{children}</ContentFrame>;
}
