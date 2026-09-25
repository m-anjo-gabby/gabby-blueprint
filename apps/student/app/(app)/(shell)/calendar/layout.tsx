// apps/student/app/(app)/(shell)/calendar/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
