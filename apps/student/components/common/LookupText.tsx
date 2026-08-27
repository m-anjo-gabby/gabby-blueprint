// apps\student\components\common\LookupText.tsx
'use client';

import * as React from 'react';
import { useColorVowelLookup } from './ColorVowelLookupProvider';
import { cn } from '@/lib/utils';

export interface LookupTextProps {
  /** 表示する英文テキスト */
  text: string;
  /** コンテナ要素のスタイルクラス */
  className?: string;
  /** レンダリングする HTML タグ（デフォルト: 'p'） */
  as?: React.ElementType;
}

/**
 * 英文テキストを単語単位に分割し、単語タップで Color Vowel 辞書検索ツールチップを呼ぶコンポーネント。
 */
export function LookupText({
  text,
  className,
  as: Component = 'p',
}: LookupTextProps) {
  const { openTooltip, activeWordKey } = useColorVowelLookup();
  const instanceId = React.useId();

  // 単語 (英数字・アポストロフィ・ハイフン) と非単語 (空白・記号) に分割
  const tokens = React.useMemo(() => {
    if (!text) return [];
    const regex = /([a-zA-Z0-9'-]+)|([^a-zA-Z0-9'-]+)/g;
    const result: Array<{ isWord: boolean; content: string }> = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        result.push({ isWord: true, content: match[1] });
      } else if (match[2]) {
        result.push({ isWord: false, content: match[2] });
      }
    }
    return result;
  }, [text]);

  const handleWordClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    wordContent: string,
    wordKey: string
  ) => {
    e.stopPropagation();
    const cleaned = wordContent.replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, '').trim();
    if (!cleaned) return;

    const rect = e.currentTarget.getBoundingClientRect();
    openTooltip(cleaned, rect, wordKey);
  };

  return (
    <Component className={className}>
      {tokens.map((token, index) => {
        if (!token.isWord) {
          return <React.Fragment key={index}>{token.content}</React.Fragment>;
        }

        const cleaned = token.content.replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, '').trim();
        const wordKey = `${instanceId}-${index}`;
        const isActive = Boolean(activeWordKey) && activeWordKey === wordKey;

        return (
          <span
            key={index}
            data-lookup-word={cleaned}
            onClick={(e) => handleWordClick(e, token.content, wordKey)}
            className={cn(
              'inline-block cursor-pointer rounded px-[1.5px] transition-colors',
              isActive
                ? 'bg-indigo-100 text-indigo-950 font-semibold'
                : 'hover:bg-indigo-50/80 hover:text-indigo-900 active:bg-indigo-100'
            )}
          >
            {token.content}
          </span>
        );
      })}
    </Component>
  );
}
