import { MessagesSquare, UserRound, Video, type LucideIcon } from 'lucide-react';
import { SUPPORT_EMAIL, buildSupportMailto } from '@gabby/lib/contact';

/**
 * ライブセッション紹介（アップセル）画面の表示内容。
 * ライブセッション付き契約を持たない利用者が「ライブセッション」タブを開いた際に表示する。
 *
 * 文言・導線の追加や差し替えはこのファイルのみで完結させる。
 * 導線は利用者の契約形態（法人／個人）ごとに併記する（audiences の並び順がそのまま表示順）。
 * - 将来、所属テナントの種別（com_m_client.client_type: 1=法人, 2=個人）で該当する方だけを
 *   表示する場合も、audiences の id で絞り込めばよい（文言の変更は不要）。
 * - アプリのみ契約にチャットを開放したら、法人向けの actions に
 *   { label: '運営に相談する', href: '/chat', variant: 'secondary' } を追加する。
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
  /** 画面内のパス、外部URL、または mailto: リンク */
  href: string;
  /** true: 外部サイトを別タブで開く */
  external?: boolean;
  variant: 'primary' | 'secondary';
}

/** 契約形態ごとの案内（見出し・案内文・導線） */
export interface LiveSessionIntroAudience {
  id: 'corporate' | 'individual';
  title: string;
  description: string;
  /** 案内文の下に別行で添える補足（連絡先など。長い英数字を本文に混ぜると改行が崩れるため分ける） */
  note?: string;
  actions: LiveSessionIntroAction[];
}

export interface LiveSessionIntroContent {
  eyebrow: string;
  title: string;
  lead: string;
  features: LiveSessionIntroFeature[];
  steps: LiveSessionIntroStep[];
  /** 導線欄の見出し */
  audienceHeading: string;
  audiences: LiveSessionIntroAudience[];
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
  audienceHeading: 'ご利用には、ライブセッション付きプランへのお申し込みが必要です',
  // 現在の利用者は法人契約が中心のため、法人向けを先に表示する
  audiences: [
    {
      id: 'corporate',
      title: '法人でご利用の方',
      description: 'ご所属先のご担当者様、または運営のサポート窓口までご相談ください。',
      note: `サポート窓口：${SUPPORT_EMAIL}`,
      actions: [
        {
          label: 'サポート窓口にメールで相談する',
          href: buildSupportMailto('ライブセッションの利用について'),
          variant: 'secondary',
        },
      ],
    },
    {
      id: 'individual',
      title: '個人でご利用の方',
      description: 'ライブセッション付きプランへの変更をご検討ください。',
      actions: [
        {
          // コーポレートサイトの料金ページは個人向けのため、対象を明示する
          label: '個人向けプラン・料金を見る',
          href: 'https://gabbyacademy.com/price',
          external: true,
          variant: 'primary',
        },
      ],
    },
  ],
};

