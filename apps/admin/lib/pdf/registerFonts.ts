import path from 'node:path';
import { Font } from '@react-pdf/renderer';

// PDF内の日本語（氏名・会社名・住所・コメント等）の文字化け対策。詳細はapps/coach/lib/pdf/
// PayNoticeDocument.tsxの同名処理のコメントを参照（アドミンの書面もコーチ向け支払通知書と
// 同じ理由・同じフォントファイルを使用する）。各書面はこのモジュールを import して使う。
export const PDF_FONT_FAMILY = 'NotoSansJP';

Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    { src: path.join(process.cwd(), 'lib/pdf/fonts/NotoSansJP-Medium.otf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'lib/pdf/fonts/NotoSansJP-Bold.otf'), fontWeight: 700 },
  ],
});

// 日本語は単語の区切り（空白）が無いため、既定のままでは長い文が枠をはみ出す。
// 日本語を含む語は1文字ずつ改行できるようにし、英単語はハイフンを入れずにそのまま折り返す。
// - 区切りの間に空文字を挟むのは、react-pdf が分割位置にハイフン(-)を描くのを避けるため。
// - 句読点・閉じ括弧等は直前の文字とまとめ、行頭に来ないようにする（簡易的な禁則処理）。
const CJK_PATTERN = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
const NO_LINE_START = new Set(Array.from('、。，．,.・：；？！?!）」』】〕〉》ーぁぃぅぇぉっゃゅょァィゥェォッャュョ…'));

function splitCjkWord(word: string): string[] {
  const units: string[] = [];
  for (const char of Array.from(word)) {
    if (units.length > 0 && NO_LINE_START.has(char)) units[units.length - 1] += char;
    else units.push(char);
  }
  return units.flatMap((unit) => [unit, '']);
}

Font.registerHyphenationCallback((word) => (CJK_PATTERN.test(word) ? splitCjkWord(word) : [word]));
