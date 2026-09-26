// apps/student/app/(app)/(shell)/notice/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
