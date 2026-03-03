import { useState, useCallback, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export function useAzureSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<SpeechSDK.PronunciationAssessmentResult | null>(null);
  const [rawResult, setRawResult] = useState<SpeechSDK.SpeechRecognitionResult | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // 結果リセット
  const resetResult = useCallback(() => {
    setResult(null);
    setRawResult(null);
    setRecordedAudioUrl(null);
  }, []);

  // 1. TTS: 読み上げ機能
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

  // 2. STT/Assessment + 録音: 評価とローカル保存機能
  const startAssessment = useCallback(async (text: string, granularity: SpeechSDK.PronunciationAssessmentGranularity) => {
    // 前回のクリーンアップ
    setResult(null);
    setRawResult(null);
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
    audioChunks.current = [];

    // マイク準備
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // MediaRecorder: ローカル保存用
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
      setRecordedAudioUrl(URL.createObjectURL(audioBlob));
      stream.getTracks().forEach(track => track.stop());
    };
    recorder.start();

    // Azure SDK: 評価用
    const config = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!, "japaneast"
    );
    const recognizer = new SpeechSDK.SpeechRecognizer(config, SpeechSDK.AudioConfig.fromDefaultMicrophoneInput());

    const evalConfig = new SpeechSDK.PronunciationAssessmentConfig(
      text, SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark, granularity, true
    );
    evalConfig.applyTo(recognizer);

    setIsRecording(true);
    recognizer.startContinuousRecognitionAsync();
    
    setTimeout(() => {
      recognizer.stopContinuousRecognitionAsync();
      recorder.stop();
      setIsRecording(false);
      recognizer.close();
    }, 7000);

    recognizer.recognized = (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        setRawResult(e.result);
        setResult(SpeechSDK.PronunciationAssessmentResult.fromResult(e.result));
      }
    };
  }, [recordedAudioUrl]);

  useEffect(() => {
    return () => {
      synthRef.current?.close();
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { speak, startAssessment, resetResult, isSpeaking, isRecording, result, rawResult, recordedAudioUrl };
}