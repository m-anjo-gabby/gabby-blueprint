// apps/student/app/(app)/(shell)/notification/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function NotificationLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
