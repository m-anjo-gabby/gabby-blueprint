import type { CommonShellDataOptions } from '@gabby/lib/shell/shellDataTypes';

/**
 * admin のシェル（ヘッダーの通知・サイドバーのチャット未読）で扱う項目。お知らせは発信する側のため受け取らない。
 * サーバー（レイアウトの loadCommonShellData）とブラウザ（ShellDataLoader）の両方で使うため、
 * 'use client' のファイルに置かない（サーバー側からはクライアント部品の参照になり、値として読めない）。
 */
export const ADMIN_SHELL_DATA_OPTIONS: CommonShellDataOptions = { includeChat: true, includeNotices: false };
