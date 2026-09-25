// apps/student/app/(app)/(shell)/profile/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame>{children}</ContentFrame>;
}
