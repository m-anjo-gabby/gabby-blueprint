// apps/student/app/(app)/(shell)/live-room/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function LiveSessionHubLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
