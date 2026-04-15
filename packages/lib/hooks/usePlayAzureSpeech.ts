import { useState, useCallback, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { buildSSML } from "../azure/ssml";

export interface TTSParameters {
  voice: string;
  style: string;
  rate: number;
  pitch: number;
}

/**
 * Azure Cognitive Services Speech SDK を使用した TTS 再生カスタムフック
 * セキュリティ向上のため、APIキーを直接参照せず、サーバー発行のAuthorization Tokenを使用します。
 */
export function usePlayAzureSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);

  /**
   * サーバーサイド(API Route/Edge Functions)から一時的な認証トークンを取得
   */
  const fetchAuthToken = async (): Promise<string> => {
    // 開発/プレ本/本番の各環境で、それぞれのバックエンドからトークンを取得します
    const response = await fetch("/api/azure/token");
    if (!response.ok) {
      throw new Error("Azure認証トークンの取得に失敗しました。");
    }
    return await response.text();
  };

  /**
   * パラメータに基づいて SSML 文字列を生成するヘルパー関数
   */
  const generateSSML = useCallback((text: string, params: TTSParameters) => {
    // 再生フックからの呼び出し時は、単語ごとの個別調整（words）は空で実行
    return buildSSML(text, {
      settings: params,
      words: [] 
    });
  }, []);

  /**
   * TTS 再生を実行するメイン関数
   * @param input - SSML文字列、またはプレーンテキスト
   * @param params - (任意) プレーンテキストの場合に適用するパラメータ
   */
  const speak = useCallback(async (input: string, params?: TTSParameters) => {
    setError(null);

    // 1. 既存の再生インスタンスがあればクリーンアップ
    if (synthRef.current) {
      try {
        synthRef.current.close();
      } catch (e) {
        // すでに閉じている、あるいは破棄済みの場合は無視
      }
    }

    try {
      // 2. Azure 認証トークンの取得 (NEXT_PUBLICを除去したための対応)
      // セキュアな環境変数を利用するため、実行の都度または短期間キャッシュしたトークンを使用します
      const token = await fetchAuthToken();
      
      // リージョンは環境変数から取得できない場合(Client側)のフォールバックとして"japaneast"を指定
      // ※リージョン名は機密情報ではないため、定数管理でも問題ありません
      const region = "japaneast";

      // 3. Azure Speech Config のセットアップ (SubscriptionKeyの代わりにAuthorizationTokenを使用)
      const config = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);

      // 4. スピーカー出力先（Player）を明示的に作成
      const player = new SpeechSDK.SpeakerAudioDestination();
      const audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(player);
      const synth = new SpeechSDK.SpeechSynthesizer(config, audioConfig);
      synthRef.current = synth;

      // 5. 入力が SSML かプレーンテキストかを判定して最終的な再生用文字列を確定
      const isSsml = input.trim().startsWith('<speak');
      const finalSsml = isSsml ? input : (params ? generateSSML(input, params) : input);

      setIsSpeaking(true);

      /**
       * SDK の非同期コールバックを Promise 化して扱う
       */
      const speakPromise = () => {
        return new Promise<SpeechSDK.SpeechSynthesisResult>((resolve, reject) => {
          synth.speakSsmlAsync(
            finalSsml,
            (result) => {
              if (result) {
                resolve(result);
              } else {
                reject(new Error("Synthesis result is null"));
              }
            },
            (err) => reject(err)
          );
        });
      };

      const result = await speakPromise();

      if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
        /*
         * 【再生完了の待機処理】
         * 合成（データの準備）完了後、ブラウザ側でのオーディオ再生が終わるまで待機します。
         * result.audioDuration は 100ナノ秒単位のため、10,000 で割ってミリ秒に変換します。
         */
        const durationMs = result.audioDuration / 10000;
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        
        console.log(`Playback finished. Duration: ${durationMs}ms`);
      } else if (result.reason === SpeechSDK.ResultReason.Canceled) {
        const details = SpeechSDK.CancellationDetails.fromResult(result);
        setError(`Canceled: ${details.errorDetails}`);
      }
    } catch (err) {
      console.error("Azure TTS error:", err);
      setError("再生中にシステムエラーが発生しました。");
    } finally {
      // 6. 状態のリセットとリソースの解放
      setIsSpeaking(false);
      if (synthRef.current) {
        synthRef.current.close();
        synthRef.current = null;
      }
    }
  }, [generateSSML]);

  /**
   * コンポーネントアンマウント時のクリーンアップ
   */
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.close();
      }
    };
  }, []);

  return { speak, generateSSML, isSpeaking, error, setError };
}