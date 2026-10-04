'use client';

import { useEffect } from 'react';
import { acquireSpeakingSession } from '../core/audioSession';

/**
 * 発話を伴う没入画面（単語帳ドリル・スプリント）で、表示中ずっと発話セッションを借りる（最初の発話で play-and-record に入った後は、画面を離れるまで戻さない）。
 * 問題ごとに出力経路を切り替えないことで、発話直後の再生のフェードインや、
 * 画面の行き来（結果→リトライ等）でのマイクの奪い合いを防ぐ。詳細は audioSession.ts。
 */
export function useSpeakingSession() {
  useEffect(() => acquireSpeakingSession(), []);
}
