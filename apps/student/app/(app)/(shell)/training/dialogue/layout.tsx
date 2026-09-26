// apps/student/app/(app)/(shell)/training/dialogue/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function DialogueLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
