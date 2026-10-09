/* eslint-disable @next/next/no-head-element, @next/next/no-img-element -- メールの HTML（Next.js の画面ではない）のため */
import * as React from 'react';
import { MAIL_LOGO_HEIGHT, MAIL_LOGO_WIDTH, getMailLogoUrl } from '../assets/logo';
import { MAIL_COMPANY, companyName, type MailBlock, type MailDocument } from './document';

/*
 * メールの HTML 版（全メール共通の外枠と部品）。
 * Outlook（Word の描画エンジン）でも崩れにくいよう、外枠・ボタンは table で組み、スタイルはすべてインラインで書く。
 * ロゴは本番の生徒ポータルの画像を URL で参照する（assets/logo.ts）。画像を表示しない設定でも alt の文字で読める。
 */

const BRAND = '#0e3196';
const TEXT = '#333333';
const MUTED = '#6b7280';
const FONT = "'Helvetica Neue', Arial, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";

const paragraphStyle: React.CSSProperties = { fontSize: '15px', lineHeight: '1.7', margin: '0 0 16px 0', whiteSpace: 'pre-wrap' };

function Paragraph({ block }: { block: Extract<MailBlock, { kind: 'paragraph' }> }) {
  return (
    <p
      style={{
        ...paragraphStyle,
        ...(block.strong ? { fontWeight: 'bold' } : null),
        ...(block.muted ? { color: MUTED } : null),
        ...(block.small ? { fontSize: '13px' } : null),
        ...(block.center ? { textAlign: 'center' } : null),
      }}
    >
      {block.text}
    </p>
  );
}

function Button({ block }: { block: Extract<MailBlock, { kind: 'button' }> }) {
  return (
    <>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '32px auto', borderCollapse: 'separate' }}>
        <tbody>
          <tr>
            <td align="center" style={{ backgroundColor: BRAND, borderRadius: '6px' }}>
              <a
                href={block.href}
                style={{
                  display: 'inline-block',
                  padding: '14px 36px',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  textDecoration: 'none',
                  borderRadius: '6px',
                }}
              >
                {block.label}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      {block.fallback && (
        <div style={{ textAlign: 'center', margin: '0 0 32px 0', padding: '0 8px' }}>
          {block.fallback.map((line) => (
            <p key={line} style={{ fontSize: '13px', color: MUTED, margin: '0 0 8px 0' }}>
              {line}
            </p>
          ))}
          <p style={{ fontSize: '13px', margin: 0, wordBreak: 'break-all' }}>
            <a href={block.href} style={{ color: BRAND, textDecoration: 'underline' }}>
              {block.href}
            </a>
          </p>
        </div>
      )}
    </>
  );
}

function Block({ block, index }: { block: MailBlock; index: number }) {
  switch (block.kind) {
    case 'paragraph':
      return <Paragraph block={block} />;
    case 'title':
      return <p style={{ fontSize: '17px', fontWeight: 'bold', margin: '0 0 12px 0', color: '#111827' }}>{block.text}</p>;
    case 'quote':
      return (
        <p
          style={{
            ...paragraphStyle,
            padding: '12px 16px',
            backgroundColor: '#f3f5fb',
            borderLeft: `3px solid ${BRAND}`,
            borderRadius: '4px',
          }}
        >
          {block.text}
        </p>
      );
    case 'details':
      return (
        <div style={{ backgroundColor: '#f3f5fb', borderRadius: '8px', padding: '20px 20px 8px 20px', margin: '24px 0' }}>
          {block.rows.map((row) => (
            <React.Fragment key={row.label}>
              <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 2px 0' }}>{row.label}</p>
              {row.sub && <p style={{ fontSize: '13px', color: '#4b5563', margin: '0 0 2px 0' }}>{row.sub}</p>}
              <p style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 12px 0', color: '#111827' }}>{row.value}</p>
            </React.Fragment>
          ))}
          {block.note && <p style={{ fontSize: '14px', color: '#4b5563', margin: '0 0 12px 0', whiteSpace: 'pre-wrap' }}>{block.note}</p>}
        </div>
      );
    case 'button':
      return <Button block={block} />;
    case 'link':
      return (
        <p style={{ ...paragraphStyle, textAlign: 'center' }}>
          <a href={block.href} style={{ color: BRAND }}>
            {block.label}
          </a>
        </p>
      );
    case 'notice':
      return (
        <div style={{ backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '16px', margin: '32px 0 0 0' }}>
          {block.items.map((item, itemIndex) => (
            <div key={item.text} style={itemIndex > 0 ? { marginTop: '12px' } : undefined}>
              <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                {item.title && (
                  <>
                    <strong>{item.title}</strong>
                    <br />
                  </>
                )}
                {item.text}
              </p>
              {item.sub && <p style={{ fontSize: '12px', color: '#92400e', margin: '8px 0 0 0' }}>{item.sub}</p>}
            </div>
          ))}
        </div>
      );
    case 'section':
      return (
        <div lang={block.lang} style={index > 0 ? { borderTop: '1px solid #e5e7eb', paddingTop: '20px', marginTop: '4px' } : undefined}>
          {block.blocks.map((child, childIndex) => (
            <Block key={childIndex} block={child} index={childIndex} />
          ))}
        </div>
      );
  }
}

/** メール全体（<html> から）。render.ts で doctype を付けて文字列にする */
export function MailLayout({ doc }: { doc: MailDocument }) {
  const lang = doc.language === 'en' ? 'en' : 'ja';
  return (
    <html lang={lang}>
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* ダークモードで勝手に色を反転させない（Apple Mail 等） */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f4f5f7' }}>
        {/* 受信一覧の要約（本文には表示しない） */}
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0, fontSize: '1px', lineHeight: '1px', color: '#f4f5f7' }}>
          {doc.preheader}
        </div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} bgcolor="#f4f5f7" style={{ backgroundColor: '#f4f5f7' }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '32px 12px 40px 12px' }}>
                <table
                  role="presentation"
                  width={600}
                  cellPadding={0}
                  cellSpacing={0}
                  bgcolor="#ffffff"
                  style={{ width: '100%', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '8px', fontFamily: FONT, color: TEXT }}
                >
                  <tbody>
                    {/* ヘッダー（ロゴ） */}
                    <tr>
                      <td align="center" style={{ padding: '24px 32px 16px 32px', borderTop: `4px solid ${BRAND}`, borderRadius: '8px 8px 0 0' }}>
                        <img
                          src={getMailLogoUrl()}
                          alt="Gabby Blueprint"
                          width={MAIL_LOGO_WIDTH}
                          height={MAIL_LOGO_HEIGHT}
                          style={{
                            display: 'block',
                            width: `${MAIL_LOGO_WIDTH}px`,
                            height: `${MAIL_LOGO_HEIGHT}px`,
                            border: 0,
                            borderRadius: '6px',
                            color: BRAND,
                            fontSize: '20px',
                            fontWeight: 'bold',
                            fontFamily: FONT,
                          }}
                        />
                        {doc.headerLabel && <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: MUTED, fontWeight: 'bold' }}>{doc.headerLabel}</p>}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: 0 }}>
                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '0 32px' }} />
                      </td>
                    </tr>

                    {/* 本文 */}
                    <tr>
                      <td style={{ padding: '32px 32px 24px 32px', fontSize: '15px', lineHeight: '1.7' }}>
                        {doc.blocks.map((block, index) => (
                          <Block key={index} block={block} index={index} />
                        ))}
                      </td>
                    </tr>

                    {/* フッター */}
                    <tr>
                      <td
                        style={{
                          padding: '24px 32px 28px 32px',
                          backgroundColor: '#f9fafb',
                          borderTop: '1px solid #e5e7eb',
                          borderRadius: '0 0 8px 8px',
                          fontSize: '12px',
                          lineHeight: '1.6',
                          color: MUTED,
                        }}
                      >
                        {doc.footer.map((line) => (
                          <p key={line.text} style={{ margin: '0 0 8px 0' }}>
                            {line.text}
                            {line.link && (
                              <>
                                {' '}
                                <a href={line.link.href} style={{ color: BRAND, textDecoration: 'underline' }}>
                                  {line.link.label}
                                </a>
                              </>
                            )}
                          </p>
                        ))}
                        <p style={{ margin: '16px 0 0 0' }}>
                          {companyName(doc.language)}
                          <br />
                          <a href={MAIL_COMPANY.url} style={{ color: MUTED, textDecoration: 'underline' }}>
                            {MAIL_COMPANY.url}
                          </a>
                        </p>
                        <p style={{ margin: '8px 0 0 0' }}>{MAIL_COMPANY.copyright}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
