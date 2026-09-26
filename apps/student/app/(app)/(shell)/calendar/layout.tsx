// apps/student/app/(app)/(shell)/calendar/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="wide">{children}</ContentFrame>;
}
