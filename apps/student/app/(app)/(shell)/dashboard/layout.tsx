// apps/student/app/(app)/(shell)/dashboard/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.dashboard}>{children}</ContentFrame>;
}
