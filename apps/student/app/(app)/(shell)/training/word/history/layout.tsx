// apps/student/app/(app)/(shell)/training/word/history/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function WordHistoryLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.wordHistory}>{children}</ContentFrame>;
}
