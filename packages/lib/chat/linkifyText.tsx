import { Fragment, ReactNode } from 'react';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/**
 * テキスト中のURLをクリック可能なアンカー（新規タブで開く）に変換する。
 */
export function linkifyText(text: string): ReactNode[] {
  const parts = text.split(URL_PATTERN);

  return parts.map((part, index) => {
    if (part.match(URL_PATTERN)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
