import 'server-only';
import { cache } from 'react';
import { getNoticesAction } from './actions/noticeActions';

/**
 * お知らせ一覧のサーバー取得（1リクエスト内で1回にまとめる）。
 * シェルの初期データ（通知センター）と、生徒のホームのお知らせカードで同じ取得を使う。
 */
export const getNoticesCached = cache(getNoticesAction);
