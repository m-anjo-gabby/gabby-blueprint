/**
 * サーバーサイド専用: Azure Speech Tokenを取得する共通関数
 */
export async function getAzureSpeechToken() {
  const region = process.env.AZURE_SPEECH_REGION || 'japaneast';
  const key = process.env.AZURE_SPEECH_SERVICE_KEY;

  if (!key) {
    throw new Error('AZURE_SPEECH_SERVICE_KEY is not defined in environment variables.');
  }

  const response = await fetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // キャッシュ戦略は必要に応じて調整（トークンは10分有効）
      cache: 'no-store', 
    }
  );

  if (!response.ok) {
    throw new Error(`Azure Token Error: ${response.statusText}`);
  }

  return response.text();
}