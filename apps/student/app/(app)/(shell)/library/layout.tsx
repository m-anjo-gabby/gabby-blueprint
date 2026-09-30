// apps/student/app/(app)/(shell)/library/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width={SHELL_CONTENT_WIDTH.library}>{children}</ContentFrame>;
}
