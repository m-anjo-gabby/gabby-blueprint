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
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <div className="flex-1 overflow-y-auto touch-pan-y">
        {/* ヒーロー: ブランドの深いインディゴを面で使う */}
        <section className="relative overflow-hidden bg-indigo-950 px-6 sm:px-10 pt-10 pb-12 text-white">
          <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-indigo-500/25 blur-3xl pointer-events-none" />
          <p className="relative text-xs font-semibold tracking-[0.2em] text-indigo-300 uppercase">{eyebrow}</p>
          <h1 className="relative mt-3 whitespace-pre-line text-2xl sm:text-3xl font-bold leading-snug tracking-tight">
            {title}
          </h1>
          <p className="relative mt-4 text-sm leading-relaxed text-indigo-100/90">{lead}</p>
        </section>

        <div className="px-6 sm:px-10 py-8 space-y-10">
          {/* 特長 */}
          <section className="space-y-5">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                  <feature.icon size={20} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-slate-900">{feature.title}</h2>
                  <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </section>

          {/* ご利用の流れ */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900">ご利用の流れ</h2>
            <ol className="grid grid-cols-3 gap-2">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-center">
                  <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="mt-2 text-sm font-bold text-slate-800">{step.title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* 導線 */}
          <section className="space-y-3">
            {actions.map((action) => (
              <IntroActionLink key={action.label} action={action} />
            ))}
            {note && <p className="text-center text-xs text-slate-500">{note}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function IntroActionLink({ action }: { action: LiveSessionIntroAction }) {
  const className = cn(
    'flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]',
    action.variant === 'primary'
      ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
