import type { ContentWidth } from '@/components/shell/PageFrames';

/**
 * シェル内の各画面の枠の幅（ContentFrame の width）。
 * 各画面の layout.tsx と、読み込み中の骨組み（ShellRouteSkeleton）で共有し、骨組み→本番で幅がずれないようにする。
 * 画面を追加したらここに幅を加え、layout.tsx からはこの値を使う。
 */
export const SHELL_CONTENT_WIDTH = {
  dashboard: 'wide',
  library: 'wide',
  favorites: 'wide',
  calendar: 'wide',
  coachMatching: 'wide',
  monitor: 'full',
  notice: 'medium',
  notification: 'medium',
  profile: 'narrow',
  liveRoom: 'medium',
  trainingPerformance: 'wide',
  wordHistory: 'medium',
  sprintHistory: 'medium',
  dialogue: 'medium',
} as const satisfies Record<string, ContentWidth>;

export type ShellContentKey = keyof typeof SHELL_CONTENT_WIDTH;
