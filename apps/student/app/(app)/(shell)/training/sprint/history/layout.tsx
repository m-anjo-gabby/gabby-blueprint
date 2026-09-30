// apps/student/app/(app)/(shell)/training/sprint/history/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function SprintHistoryLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.sprintHistory}>{children}</ContentFrame>;
}
