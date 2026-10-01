// apps/student/app/(app)/(shell)/coach-matching/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function CoachMatchingLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.coachMatching}>{children}</ContentFrame>;
}
