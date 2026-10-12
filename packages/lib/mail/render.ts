// packages/lib/mail/render.ts
/**
 * メールの HTML 版・テキスト版の組み立て（送信はしない）
 *
 * 各メールの件名・中身は templates/ の build〜Mail が MailContent として返し、ここで HTML 版・テキスト版にする。
 * 💡 送信処理（actions/*、core.ts）は 'server-only' でサーバー専用にしているため、
 * 文面の検証（testing/unit/*.test.ts、Node で実行）から読み込めるよう、組み立て処理だけをここに分けている。
 * API キー等の秘密情報を参照する処理はこのファイルに置かないこと。
 */
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge'; // App RouterのRSCで安全に動く軽量エクスポート
import { renderMailText, type MailContent } from './layout/document';
import { MailLayout } from './layout/MailLayout';

export interface RenderedEmail {
  subject: string;
  /** HTML 版 */
  html: string;
  /** テキスト版（HTML と同じ元データから作る。HTML を表示しないメールソフト向け） */
  text: string;
}

/** 件名・中身から HTML 版・テキスト版を作る */
export function renderMail({ subject, doc }: MailContent): RenderedEmail {
  const html = `<!DOCTYPE html>${renderToString(React.createElement(MailLayout, { doc }))}`;
  return { subject, html, text: renderMailText(doc) };
}
