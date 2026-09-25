// apps/student/app/(app)/(shell)/dashboard/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="wide">{children}</ContentFrame>;
}
