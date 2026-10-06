/**
 * メールの中身の定義（HTML 版とテキスト版の共通の元データ）
 *
 * 各メールは「ブロックの並び＋フッター」を組み立てるだけにし、HTML（MailLayout.tsx）とテキスト（renderMailText）は
 * ここから作る。文言を1か所で持つため、HTML 版とテキスト版で内容がずれない。
 * テキスト版は、HTML を表示しない・テキストで読む設定のメールソフト（企業のメール環境に多い）向け。
 */

/** 1つの言語（生徒: ja / コーチ: en） */
export type MailLocale = 'ja' | 'en';

/** メールの言語。bilingual は日本語→英語の併記（HTML の lang・テキスト版の見出し記号にも使う） */
export type MailLanguage = MailLocale | 'bilingual';

export type MailBlock =
  /** 段落。改行はそのまま表示する */
  | { kind: 'paragraph'; text: string; strong?: boolean; muted?: boolean; small?: boolean; center?: boolean }
  /** 本文の見出し（通知のタイトル等） */
  | { kind: 'title'; text: string }
  /** 引用（チャットのメッセージ） */
  | { kind: 'quote'; text: string }
  /** 項目と値の一覧（セッション名・日時等）。sub は値の上に小さく出す補足（シリーズ名等） */
  | { kind: 'details'; rows: { label: string; value: string; sub?: string | null }[]; note?: string | null }
  /** 主ボタン。fallback を渡すと、ボタンの下に「押せない場合」の案内と URL を出す */
  | { kind: 'button'; label: string; href: string; fallback?: string[] }
  /** 中央寄せのリンク（補助の操作） */
  | { kind: 'link'; label: string; href: string }
  /** 注意の囲み（有効期限等） */
  | { kind: 'notice'; items: { title?: string; text: string; sub?: string }[] }
  /** 言語ごとのまとまり（日英併記用）。2つ目以降は区切り線を付ける */
  | { kind: 'section'; lang: MailLocale; blocks: MailBlock[] };

/** フッターの1行。link があれば行末にリンクを付ける */
export interface MailFooterLine {
  text: string;
  link?: { label: string; href: string };
}

export interface MailDocument {
  language: MailLanguage;
  /** 受信一覧で件名の横に出る要約（本文には表示しない） */
  preheader: string;
  /** ロゴの下に小さく出すポータル名（例: 管理画面 / Admin Console） */
  headerLabel?: string;
  blocks: MailBlock[];
  /** フッター（配信理由・配信停止・問い合わせ先）。会社名・著作権表示は全メール共通で付く */
  footer: MailFooterLine[];
}

/** 1通のメール（件名と中身）。各テンプレートはこれを返し、render.ts の renderMail で HTML 版・テキスト版にする */
export interface MailContent {
  subject: string;
  doc: MailDocument;
}

/** 件名（先頭にサービス名を付ける。日本語・併記は【】、英語は []） */
export function mailSubject(language: MailLanguage, text: string): string {
  return language === 'en' ? `[Gabby Blueprint] ${text}` : `【Gabby Blueprint】${text}`;
}

export const MAIL_COMPANY = {
  name: { ja: '株式会社ギャビーアカデミー', en: 'Gabby Academy Co., Ltd.' },
  url: 'https://gabbyacademy.com/',
  copyright: '© Gabby Academy Co., Ltd.',
} as const;

/** 会社名（言語に合わせる。併記は両方） */
export function companyName(language: MailLanguage): string {
  if (language === 'bilingual') return `${MAIL_COMPANY.name.ja} / ${MAIL_COMPANY.name.en}`;
  return MAIL_COMPANY.name[language];
}

/** 受信一覧の要約に使う（長い本文は先頭だけ） */
export function toPreheader(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function labelLine(label: string, lang: MailLocale): string {
  return lang === 'ja' ? `【${label}】` : `[${label}]`;
}

function renderBlocksText(blocks: MailBlock[], lang: MailLocale): string[] {
  const parts: string[] = [];
  blocks.forEach((block) => {
    switch (block.kind) {
      case 'paragraph':
        parts.push(block.text);
        break;
      case 'title':
        parts.push(`■ ${block.text}`);
        break;
      case 'quote':
        parts.push(
          block.text
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        );
        break;
      case 'details':
        parts.push(
          [
            ...block.rows.map((row) => [labelLine(row.label, lang), row.sub, row.value].filter(Boolean).join('\n')),
            ...(block.note ? [block.note] : []),
          ].join('\n\n')
        );
        break;
      case 'button':
      case 'link':
        // テキスト版はボタンの文言の直下に URL を置く（URL が長くても1行にする）
        parts.push(`▼ ${block.label}\n${block.href}`);
        break;
      case 'notice':
        parts.push(block.items.map((item) => [item.title ? `※ ${item.title}` : null, item.text, item.sub].filter(Boolean).join('\n')).join('\n\n'));
        break;
      case 'section':
        if (parts.length > 0) parts.push('------------------------------');
        parts.push(...renderBlocksText(block.blocks, block.lang));
        break;
    }
  });
  return parts;
}

/** テキスト版（HTML と同じ元データから作る） */
export function renderMailText(doc: MailDocument): string {
  const lang = doc.language === 'en' ? 'en' : 'ja';
  const footer = doc.footer.map((line) => {
    if (!line.link) return line.text;
    // メールアドレスはそのまま、URL は文言の次の行に置く
    if (line.link.href.startsWith('mailto:')) return `${line.text} ${line.link.label}`;
    return `${line.text}\n${line.link.label}: ${line.link.href}`;
  });
  return [
    'Gabby Blueprint English',
    ...(doc.headerLabel ? [doc.headerLabel] : []),
    '',
    renderBlocksText(doc.blocks, lang).join('\n\n'),
    '',
    '--',
    [...footer, `${companyName(doc.language)}\n${MAIL_COMPANY.url}`].join('\n\n'),
    '',
  ].join('\n');
}
