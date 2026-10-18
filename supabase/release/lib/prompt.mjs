// supabase/release/lib/prompt.mjs
//
// トークン等の、入力内容を表示しない入力。run.mjs と status.mjs で共有する。

import readline from 'node:readline';

/** 入力内容を表示しない入力（トークン用）。確認プロンプトより前に1回だけ使う */
export function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    // close() は 'close' イベントを同期的に発火するため、回答を先に確定させてから閉じる
    rl.on('close', () => resolve(''));
    rl.question(question, (answer) => {
      resolve(answer.trim());
      process.stdout.write('\n');
      rl.close();
    });
  });
}
