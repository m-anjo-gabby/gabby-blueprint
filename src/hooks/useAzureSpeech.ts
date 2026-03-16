import { useState, useCallback, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

// TTS用のパラメータ型定義
export interface TTSParameters {
  voice: string;
  style: string;
  rate: number;
  pitch: number;
}

export function useAzureSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);

  /**
   * SSML生成ヘルパー
   * UIのパラメータからAzure Speech SDK用のSSMLを作成
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
   * TTS: クライアントサイドでの読み上げ
   * サーバーを介さないため、調整中のプレビューが爆速になります
   */
  const speak = useCallback((text: string, params: TTSParameters) => {
    // 既存の再生があれば停止
    if (synthRef.current) {
      synthRef.current.close();
    }
      
    const config = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!, "japaneast"
    );
    
    // スピーカー出力用のインスタンス
    const synth = new SpeechSDK.SpeechSynthesizer(config, SpeechSDK.AudioConfig.fromDefaultSpeakerOutput());
    synthRef.current = synth;

    const ssml = generateSSML(text, params);
    setIsSpeaking(true);
    
    synth.speakSsmlAsync(
      ssml, 
      () => {
        setIsSpeaking(false);
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

  // クリーンアップ
  useEffect(() => {
    return () => {
      synthRef.current?.close();
    };
  }, []);

  return { speak, generateSSML, isSpeaking };
}