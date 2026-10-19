'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../utils';

/** react-markdown が渡す構文木（node）を DOM に渡さないように外す */
function domProps<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

// Tailwind の typography プラグインを入れていないため、要素ごとに見た目を当てる
const components: Components = {
  h1: (props) => <h1 {...domProps(props)} className="mt-5 mb-2 text-lg font-bold text-ink first:mt-0" />,
  h2: (props) => <h2 {...domProps(props)} className="mt-5 mb-2 text-base font-bold text-ink first:mt-0" />,
  h3: (props) => <h3 {...domProps(props)} className="mt-4 mb-1.5 text-sm font-bold text-ink first:mt-0" />,
  p: (props) => <p {...domProps(props)} className="my-3 whitespace-pre-wrap first:mt-0 last:mb-0" />,
  ul: (props) => <ul {...domProps(props)} className="my-3 list-disc space-y-1 pl-5" />,
  ol: (props) => <ol {...domProps(props)} className="my-3 list-decimal space-y-1 pl-5" />,
  a: (props) => (
    <a
      {...domProps(props)}
      className="font-bold text-brand underline hover:text-brand-strong"
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  blockquote: (props) => (
    <blockquote {...domProps(props)} className="my-3 border-l-4 border-brand-200 pl-4 text-ink-muted" />
  ),
  hr: (props) => <hr {...domProps(props)} className="my-4 border-line" />,
  table: (props) => (
    <div className="my-3 overflow-x-auto">
      <table {...domProps(props)} className="w-full border-collapse text-left text-xs" />
    </div>
  ),
  th: (props) => <th {...domProps(props)} className="border border-line bg-canvas px-2 py-1.5 font-bold text-ink" />,
  td: (props) => <td {...domProps(props)} className="border border-line px-2 py-1.5" />,
  code: ({ className, ...props }) => (
    <code
      {...domProps(props)}
      className={cn('rounded bg-line/60 px-1.5 py-0.5 font-mono text-xs text-ink', className)}
    />
  ),
};

/** お知らせ本文（Markdown）の表示。ポップアップとお知らせ一覧で共通 */
export function NoticeMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('text-sm leading-relaxed text-ink-soft wrap-break-word', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
