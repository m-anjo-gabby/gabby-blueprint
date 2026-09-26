import { MessagesSquare, UserRound, Video, type LucideIcon } from 'lucide-react';

/**
 * ライブセッション紹介（アップセル）画面の表示内容。
 * ライブセッション付き契約を持たない利用者が「ライブセッション」タブを開いた際に表示する。
 *
 * 文言・導線の追加や差し替えはこのファイルのみで完結させる。
 * 例: 「担当者に相談」導線を追加する場合は actions に
 *   { label: '担当者に相談する', href: '/...', variant: 'secondary' } を追加する。
 */

export interface LiveSessionIntroFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface LiveSessionIntroStep {
  title: string;
  description: string;
}

export interface LiveSessionIntroAction {
  label: string;
  href: string;
  /** true: 外部サイトを別タブで開く */
  external?: boolean;
  variant: 'primary' | 'secondary';
}

export interface LiveSessionIntroContent {
  eyebrow: string;
  title: string;
  lead: string;
  features: LiveSessionIntroFeature[];
  steps: LiveSessionIntroStep[];
  actions: LiveSessionIntroAction[];
  /** 導線の下に添える補足（任意） */
  note?: string;
}

export const LIVE_SESSION_INTRO: LiveSessionIntroContent = {
  eyebrow: 'ライブセッション',
  title: '専属コーチと、\n話せる英語へ。',
  lead: 'アプリでの自主トレーニングに、専属コーチとのオンラインレッスン「ライブセッション」を組み合わせたプランです。',
  features: [
    {
      icon: UserRound,
      title: '専属コーチが担当',
      description: 'あなたの目標とレベルに合わせて、専属のコーチがレッスンを行います。',
    },
    {
      icon: MessagesSquare,
      title: 'レッスンと自主トレがつながる',
      description: 'レッスン後の課題や練習にも、このアプリで取り組めます。',
    },
    {
      icon: Video,
      title: 'アプリだけで完結',
      description: '予約から当日の入室まで、このアプリの中で行えます。',
    },
  ],
  steps: [
    { title: 'コーチを選ぶ', description: '相性の良い専属コーチを選びます' },
    { title: '予約する', description: 'ご都合の良い日時を予約します' },
    { title: '入室する', description: '時間になったらアプリから入室します' },
  ],
  actions: [
    {
      label: 'プラン・料金を見る',
      href: 'https://gabbyacademy.com/price',
      external: true,
      variant: 'primary',
    },
  ],
  note: 'ご利用には、ライブセッション付きプランへのお申し込みが必要です。',
};

