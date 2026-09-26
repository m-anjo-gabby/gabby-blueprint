// apps/student/app/(app)/(shell)/coach-matching/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function CoachMatchingLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="wide">{children}</ContentFrame>;
}
