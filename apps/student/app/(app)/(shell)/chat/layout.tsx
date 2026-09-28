import { ContentFrame } from '@/components/shell/PageFrames';
import { StudentChatLayout } from './_components/StudentChatLayout';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContentFrame width="full" fill>
      <StudentChatLayout>{children}</StudentChatLayout>
    </ContentFrame>
  );
}
