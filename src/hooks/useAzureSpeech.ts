import { useState, useCallback, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export function useAzureSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<SpeechSDK.PronunciationAssessmentResult | null>(null);
  const [rawResult, setRawResult] = useState<SpeechSDK.SpeechRecognitionResult | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0); // カウントダウン用

  const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);    // タイムアウト用
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // カウントダウン用
  const cleanupRef = useRef<(() => void) | null>(null);

  // 結果リセット
  const resetResult = useCallback(() => {
    setResult(null);
    setRawResult(null);
    setRecordedAudioUrl(null);
    setTimeLeft(0);
  }, []);

  // TTS: 読み上げ機能
  const speak = useCallback((text: string, voice: string, style: string, rate: number, pitch: number) => {
    // 前回のインスタンスが残っていれば閉じる
    if (synthRef.current) {
      synthRef.current.close();
      synthRef.current = null;
    }
      
    const config = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!, "japaneast"
    );
    
    // 毎回新しいインスタンスを生成
    const synth = new SpeechSDK.SpeechSynthesizer(config, SpeechSDK.AudioConfig.fromDefaultSpeakerOutput());
    synthRef.current = synth;

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="${voice}"><mstts:express-as style="${style}"><prosody rate="${rate}" pitch="${pitch > 0 ? '+' : ''}${pitch}%">${text}</prosody></mstts:express-as></voice>
      </speak>`;

    setIsSpeaking(true);
    
    // 終了コールバック内で ref を null にする
    synth.speakSsmlAsync(
      ssml, 
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (result) => {
        setIsSpeaking(false);
        synth.close();
        if (synthRef.current === synth) {
          synthRef.current = null;
        }
      },
      (err) => {
        console.error(err);
        setIsSpeaking(false);
        synth.close();
        if (synthRef.current === synth) {
          synthRef.current = null;
        }
      }
    );
  }, []);

  // 発音評価停止
  const stopAssessment = useCallback(() => {
    // 既存の cleanup 処理を呼び出す
    if (cleanupRef.current) cleanupRef.current();
  }, []);

  // STT: 発音評価（録音: 評価とローカル保存機能）
  const startAssessment = useCallback(async (text: string, granularity: SpeechSDK.PronunciationAssessmentGranularity) => {
    // リセット処理
    resetResult();

    // マイク・録音準備
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;
    audioChunks.current = [];
    recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
      setRecordedAudioUrl(URL.createObjectURL(audioBlob));
    };
    
    // Azure Speech設定
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!, "japaneast"
    );
    speechConfig.speechRecognitionLanguage = "en-US";
    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

    // 参照テキストを設定
    const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
      text, 
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      granularity,
      true
    );
    pronunciationConfig.phonemeAlphabet = "IPA"; // 音素の表示形式 (IPA: 国際音声記号)
    pronunciationConfig.applyTo(recognizer);

    // 終了処理を共通化 (二重実行防止)
    let isFinished = false;
    const cleanup = () => {
      if (isFinished) return;
      isFinished = true;
      
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      try {
        recognizer.close();
        recorder.stop();
        stream.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.warn("Cleanup warning:", e);
      }
      setIsRecording(false);
      setTimeLeft(0);
    };
    cleanupRef.current = cleanup;

    // 強制終了用タイマーIDを保持
    timerRef.current = setTimeout(() => {
      cleanup();
    }, 7000);

    // カウントダウン開始
    setTimeLeft(7);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);

    setIsRecording(true);
    recorder.start();

    // recognizeOnceAsync を使用
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          setRawResult(result);
          setResult(SpeechSDK.PronunciationAssessmentResult.fromResult(result));
        }
        cleanup();
      },
      (err) => {
        console.error(err);
        cleanup();
      }
    );
  }, [resetResult]);

  useEffect(() => {
    return () => {
      synthRef.current?.close();
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  return { speak, startAssessment, stopAssessment, resetResult, isSpeaking, isRecording, result, rawResult, recordedAudioUrl, timeLeft };
}