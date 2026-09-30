// apps/student/app/(app)/(shell)/calendar/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.calendar}>{children}</ContentFrame>;
}
