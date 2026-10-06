/** payload（JSON）の文字列の値を読む（文字列でない・空文字の場合は null） */
export function readText(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}
