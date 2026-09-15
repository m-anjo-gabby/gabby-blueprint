import { useEffect, useRef, useState } from 'react';
import { LIVE_SESSION_WARNING_AFTER_MS, LIVE_SESSION_END_AFTER_MS } from '../constants';

interface ChatMessageLike {
  isSelf: boolean;
  message: string;
}

export interface UseLiveSessionRoomOrchestrationArgs {
  sessionId: string;
  isJoined: boolean;
  zoomSessionId: string | null | undefined;
  chatMessages: ChatMessageLike[];
  /**
   * 30分タイマー（警告・自動終了）を開始してよいかどうかの条件。
   * 生徒側は自分の入室(isJoined)のみで開始する一方、コーチ側は生徒の在室(isStudentPresent)も
   * 待ってから開始するため、この判定は呼び出し側に委ねる。
   */
  canStartTimer: boolean;
  /** 30分の制限時間に達した時に呼ばれる（タイマー自体の停止・入退室記録は本フックが行う） */
  onTimeLimitReached: () => void;
  /** apps/{student,coach}/actions/videoSessionAction.ts の同名サーバーアクションをそのまま渡す */
  recordCallJoin: (sessionId: string, zoomSessionId: string) => Promise<string | null>;
  recordCallLeave: (callLogId: string) => Promise<void>;
  recordChatMessage: (sessionId: string, message: string) => Promise<void>;
}

export interface UseLiveSessionRoomOrchestrationResult {
  isTimeWarningVisible: boolean;
  /** 進行中のタイマーを止める。退出処理（自分から/強制終了いずれも）の先頭で呼ぶ */
  clearSessionTimers: () => void;
  /** 未クローズの入室記録があれば退室記録を残す。退出処理・アンマウント時に呼ぶ */
  recordLeaveIfNeeded: () => void;
}

/**
 * 生徒・コーチ双方のライブセッションルーム（LiveSessionRoomView/LiveSessionRoom）で
 * ほぼ丸ごと重複していたオーケストレーション処理（入退室のcom_t_session_call_log記録、
 * 30分の警告・自動終了タイマー、Zoom in-callチャットのcom_t_session_chatへの永続化）を
 * 共通化したもの。UI（プレビュー/通話画面のJSX）やロック機構(コーチ側のみ)は
 * 各アプリのコンポーネント側に残し、本フックは副作用のみを扱う。
 */
export function useLiveSessionRoomOrchestration({
  sessionId,
  isJoined,
  zoomSessionId,
  chatMessages,
  canStartTimer,
  onTimeLimitReached,
  recordCallJoin,
  recordCallLeave,
  recordChatMessage,
}: UseLiveSessionRoomOrchestrationArgs): UseLiveSessionRoomOrchestrationResult {
  const [isTimeWarningVisible, setIsTimeWarningVisible] = useState(false);
  const sessionTimersStarted = useRef(false);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callLogIdRef = useRef<string | null>(null);
  const persistedChatCountRef = useRef(0);

  const recordLeaveIfNeeded = () => {
    const id = callLogIdRef.current;
    if (!id) return;
    callLogIdRef.current = null;
    void recordCallLeave(id);
  };

  const clearSessionTimers = () => {
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
    warningTimeoutRef.current = null;
    endTimeoutRef.current = null;
  };

  // Zoom Video SDKへの入室が確定した時点で、com_t_session_call_logに入室記録を残す
  useEffect(() => {
    if (!isJoined || !zoomSessionId || callLogIdRef.current) return;
    recordCallJoin(sessionId, zoomSessionId).then((callLogId) => {
      callLogIdRef.current = callLogId;
    });
  }, [isJoined, zoomSessionId, sessionId, recordCallJoin]);

  // Zoom Video SDKのin-callチャットは永続化機能を持たないため、自分が送信したメッセージのみ
  // （chat-on-messageは送受信双方にエコーされるためisSelfで判定）com_t_session_chatへ保存する。
  // 二重保存防止のため保存済み件数をrefで追跡し、新規追加分のみ処理する。
  useEffect(() => {
    const newMessages = chatMessages.slice(persistedChatCountRef.current);
    if (newMessages.length === 0) return;
    persistedChatCountRef.current = chatMessages.length;
    for (const msg of newMessages) {
      if (msg.isSelf) {
        void recordChatMessage(sessionId, msg.message);
      }
    }
  }, [chatMessages, sessionId, recordChatMessage]);

  useEffect(() => {
    if (!canStartTimer || sessionTimersStarted.current) return;
    sessionTimersStarted.current = true;

    warningTimeoutRef.current = setTimeout(() => {
      setIsTimeWarningVisible(true);
    }, LIVE_SESSION_WARNING_AFTER_MS);

    endTimeoutRef.current = setTimeout(() => {
      onTimeLimitReached();
    }, LIVE_SESSION_END_AFTER_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStartTimer]);

  useEffect(() => {
    return () => {
      clearSessionTimers();
    };
  }, []);

  return { isTimeWarningVisible, clearSessionTimers, recordLeaveIfNeeded };
}
