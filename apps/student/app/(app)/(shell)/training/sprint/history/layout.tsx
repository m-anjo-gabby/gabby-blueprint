// apps/student/app/(app)/(shell)/training/sprint/history/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function SprintHistoryLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
