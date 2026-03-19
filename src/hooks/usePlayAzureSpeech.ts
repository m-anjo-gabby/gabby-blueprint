import { useState, useCallback, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export interface TTSParameters {
  voice: string;
  style: string;
  rate: number;
  pitch: number;
}

/**
 * Azure Cognitive Services Speech SDK を使用した TTS 再生カスタムフック
 */
export function usePlayAzureSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);

  /**
   * パラメータに基づいて SSML 文字列を生成するヘルパー関数
   */
  const generateSSML = useCallback((text: string, params: TTSParameters) => {
    const { voice, style, rate, pitch } = params;
    const pitchStr = pitch >= 0 ? `+${pitch}%` : `${pitch}%`;

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
      <voice name="${voice}">
        <mstts:express-as style="${style}">
          <prosody rate="${rate}" pitch="${pitchStr}">${text}</prosody>
        </mstts:express-as>
      </voice>
    </speak>`;
  }, []);

  /**
   * TTS 再生を実行するメイン関数
   * * @param input - SSML文字列、またはプレーンテキスト
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

    // 2. Azure Speech Config のセットアップ
    const config = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!,
      process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION || "japaneast"
    );

    // 3. スピーカー出力先（Player）を明示的に作成
    const player = new SpeechSDK.SpeakerAudioDestination();
    const audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(player);
    const synth = new SpeechSDK.SpeechSynthesizer(config, audioConfig);
    synthRef.current = synth;

    // 4. 入力が SSML かプレーンテキストかを判定して最終的な再生用文字列を確定
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

    try {
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
      setError("Playback failed due to a system error.");
    } finally {
      // 5. 状態のリセットとリソースの解放
      setIsSpeaking(false);
      synth.close();
      synthRef.current = null;
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