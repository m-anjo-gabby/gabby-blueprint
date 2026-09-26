// apps/student/app/(app)/(shell)/chat/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function ChatListLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="medium">{children}</ContentFrame>;
}
