// apps/student/app/(app)/(shell)/training/word/history/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function WordHistoryLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
