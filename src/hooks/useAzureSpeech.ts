import { useState, useCallback, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export interface TTSParameters {
  voice: string;
  style: string;
  rate: number;
  pitch: number;
}

export function useAzureSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);

  // SSML生成ヘルパー（既存のロジックは残し、内部・外部両方で利用可能にする）
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
   * TTS再生メイン関数
   * @param input - SSML文字列、またはプレーンテキスト
   * @param params - (任意) プレーンテキストの場合のパラメータ
   */
  const speak = useCallback((input: string, params?: TTSParameters) => {
    setError(null); // 再生開始時にリセット
    if (synthRef.current) {
      synthRef.current.close();
    }

    const config = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!,
      process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION || "japaneast"
    );
    
    const synth = new SpeechSDK.SpeechSynthesizer(config, SpeechSDK.AudioConfig.fromDefaultSpeakerOutput());
    synthRef.current = synth;

    // 入力がSSMLかどうかを判定（簡易的な判定）
    const isSsml = input.trim().startsWith('<speak');
    
    // SSMLでない場合は生成、SSMLの場合はそのまま使用
    const finalSsml = isSsml ? input : (params ? generateSSML(input, params) : input);

    setIsSpeaking(true);
    
    synth.speakSsmlAsync(
      finalSsml, 
      (result) => {
        setIsSpeaking(false);
        if (result.reason === SpeechSDK.ResultReason.Canceled) {
          const details = SpeechSDK.CancellationDetails.fromResult(result);
          // SSMLのタグ閉じ忘れやIPAの不正などをここでキャッチ
          setError(`Playback failed: ${details.errorDetails}`);
        }
        synth.close();
        synthRef.current = null;
      },
      (err) => {
        console.error("TTS Playback Error:", err);
        setIsSpeaking(false);
        synth.close();
        synthRef.current = null;
      }
    );
  }, [generateSSML]);

  useEffect(() => {
    return () => {
      synthRef.current?.close();
    };
  }, []);

  return { speak, generateSSML, isSpeaking, error, setError };
}