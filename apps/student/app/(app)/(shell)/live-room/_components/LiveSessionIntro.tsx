import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIVE_SESSION_INTRO, type LiveSessionIntroAction } from '@/constants/liveSessionIntro';

/**
 * ライブセッション紹介（アップセル）画面。
 * ライブセッション付き契約を持たない利用者向けに、ライブセッションタブ内でのみ表示する
 * （ホーム等へのバナー常設はせず、高級感を損なわない控えめな訴求にとどめる）。
 */
export function LiveSessionIntro() {
  const { eyebrow, title, lead, features, steps, actions, note } = LIVE_SESSION_INTRO;

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
      <div>
        {/* ヒーロー: ブランドのグラデーション面（ホームの「今日やること」と共通） */}
        <section className="relative overflow-hidden bg-brand-hero px-6 sm:px-10 pt-10 pb-12 text-white">
          <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <p className="relative text-xs font-semibold text-brand-100">{eyebrow}</p>
          <h1 className="relative mt-3 whitespace-pre-line text-2xl sm:text-3xl font-bold leading-snug tracking-tight">
            {title}
          </h1>
          <p className="relative mt-4 text-sm leading-relaxed text-white/85">{lead}</p>
        </section>

        <div className="px-6 sm:px-10 py-8 space-y-10">
          {/* 特長 */}
          <section className="space-y-5">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
                  <feature.icon size={20} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-ink">{feature.title}</h2>
                  <p className="text-sm leading-relaxed text-ink-soft">{feature.description}</p>
                </div>
              </div>
            ))}
          </section>

          {/* ご利用の流れ */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-ink">ご利用の流れ</h2>
            <ol className="grid grid-cols-3 gap-2">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-control border border-line/60 bg-slate-50/70 px-2 py-3 sm:p-3 text-center">
                  <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="mt-2 text-[13px] sm:text-sm font-bold text-ink [word-break:auto-phrase]">{step.title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-muted [word-break:auto-phrase]">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* 導線 */}
          <section className="space-y-3">
            {actions.map((action) => (
              <IntroActionLink key={action.label} action={action} />
            ))}
            {note && <p className="text-center text-xs text-ink-muted">{note}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function IntroActionLink({ action }: { action: LiveSessionIntroAction }) {
  const className = cn(
    'flex h-13 w-full items-center justify-center gap-2 rounded-control text-sm font-bold transition-all active:scale-[0.98]',
    action.variant === 'primary'
      // 料金ページへの導線はコーポレートサイトの CTA と揃えてゴールドにする
      ? 'bg-gold text-brand-deep shadow-sm hover:brightness-95'
      : 'border border-line bg-surface text-ink-soft hover:bg-slate-50'
  );

  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        {action.label}
        <ExternalLink size={16} />
      </a>
    );
  }

  return (
    <Link href={action.href} className={className}>
      {action.label}
      <ArrowRight size={16} />
    </Link>
  );
}
