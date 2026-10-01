// apps/student/app/(app)/(shell)/live-room/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function LiveSessionHubLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.liveRoom}>{children}</ContentFrame>;
}
