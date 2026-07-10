/**
 * ----------------------------------------------
 * 発話評価実行時専用のUI状態型
 * ----------------------------------------------
 */

// 音声認識の単語ごとのマッチング結果
export interface WordMatch {
  word: string;      // 正解の単語
  heard: string;     // 実際に聞き取られた単語
  isMatch: boolean;  // 一致したか
  isFuzzy: boolean;  // 発音ミス（忖度一致）か
  isCombined: boolean; // リンキング（結合）か
}

// 音声解析の総合結果
export interface AnalysisResult {
  score: number;      // 0.0 ~ 1.0
  summary: string;    // 総合コメント
  matches: WordMatch[];
  issues: string[];   // 改善ポイントのリスト
  hasIssues?: boolean;
}

// フィードバック表示の見た目設定
export interface FeedbackConfig {
  fill: string;      // テーマカラー (hex/tailwind color)
  tagText: string;   // "Perfect!", "Good" 等
}