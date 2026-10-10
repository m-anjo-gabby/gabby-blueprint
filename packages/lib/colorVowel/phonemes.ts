// packages/lib/colorVowel/phonemes.ts
//
// ColorVowel辞書の発音記号（IPA・米国英語）を音素表記（ARPAbet 形式。例: /ˈteɪlər/ → t ey l er）に変換する。
// 表記は CHIVOX 利用時に作った表記ルール（Gabby x Chivox phonetic notations）に合わせる。
// 生徒アプリの表示と、辞書データ作成時の検証（.claude/skills/cv-dictionary-tsv/scripts/validate.ts）で共通に使う。
// 方針: docs/cv-dictionary/JUDGEMENT-GUIDE.md（CVJ-20261010-09）

/** 音素1つ。stressed は第一アクセントのある母音 */
export interface Phoneme {
  code: string;
  stressed: boolean;
}

export interface ParsedIpa {
  phonemes: Phoneme[];
  /** 変換できなかった記号（空なら全体を変換できた） */
  unknownSymbols: string[];
}

// 母音（長いものから照合する）。R音化母音は Color Vowel の方針に合わせる（CVJ-20261010-01・02）
// - /ɪr/ は GREEN TEA のため iy r（暫定。確認依頼 D-02）
// - /ɔr/ は ao r（暫定。確認依頼 D-03）
// - /ʊr/ は PURPLE SHIRT のため er
const VOWELS: ReadonlyArray<readonly [string, string]> = [
  ['ɜːr', 'er'], ['ɜr', 'er'], ['ɜː', 'er'], ['ɝ', 'er'], ['ɚ', 'er'], ['ʊr', 'er'],
  ['ɪr', 'iy'],
  ['eɪ', 'ey'], ['aɪ', 'ay'], ['aʊ', 'aw'], ['ɔɪ', 'oy'], ['oʊ', 'ow'], ['əʊ', 'ow'],
  ['iː', 'iy'], ['uː', 'uw'], ['ɑː', 'aa'], ['ɔː', 'ao'],
  ['i', 'iy'], ['ɪ', 'ih'], ['e', 'eh'], ['ɛ', 'eh'], ['æ', 'ae'], ['ɑ', 'aa'], ['ɒ', 'aa'],
  ['ɔ', 'ao'], ['ʊ', 'uh'], ['u', 'uw'], ['ʌ', 'ah'], ['ɜ', 'er'], ['ə', 'ax'],
];

const CONSONANTS: ReadonlyArray<readonly [string, string]> = [
  ['tʃ', 'ch'], ['dʒ', 'jh'],
  ['p', 'p'], ['b', 'b'], ['t', 't'], ['d', 'd'], ['k', 'k'], ['ɡ', 'g'], ['g', 'g'],
  ['f', 'f'], ['v', 'v'], ['θ', 'th'], ['ð', 'dh'], ['s', 's'], ['z', 'z'], ['ʃ', 'sh'], ['ʒ', 'zh'],
  ['h', 'hh'], ['m', 'm'], ['n', 'n'], ['ŋ', 'ng'], ['l', 'l'], ['r', 'r'], ['j', 'y'], ['w', 'w'],
];

// 音素表記に出さない記号（第二アクセント・音節の区切り・囲みの /）
const IGNORED = new Set(['ˌ', '.', '/', ' ']);
const PRIMARY_STRESS = 'ˈ';
const VOWEL_CHARS = /[iɪeɛæaɑɒɔoʊuʌəɜɝɚ]/;

export const VOWEL_PHONEMES: ReadonlySet<string> = new Set(VOWELS.map(([, code]) => code));

export const isVowelPhoneme = (code: string): boolean => VOWEL_PHONEMES.has(code);

/** 強勢のある母音の音素 → Color Vowel（cv_id）。直後が r の母音は R音化母音として扱う */
const PHONEME_TO_CV: Readonly<Record<string, string>> = {
  iy: 'green_tea', ih: 'silver_pin', ey: 'gray_day', eh: 'red_pepper', ae: 'black_cat',
  er: 'purple_shirt', ah: 'cup_of_mustard', ax: 'cup_of_mustard', aa: 'olive_sock', ao: 'auburn_dog',
  oy: 'turquoise_toy', ow: 'rose_boat', uh: 'wooden_hook', uw: 'blue_moon', aw: 'brown_cow', ay: 'white_tie',
};
const R_COLORED_TO_CV: Readonly<Record<string, string>> = { ao: 'orange_door', aa: 'olive_sock' };

/** IPA を音素に分解する。/ər/ は直後に母音が続く場合だけ ax + r（arrive /əˈraɪv/）とし、それ以外は er */
export function parseIpa(ipa: string): ParsedIpa {
  const body = ipa.trim();
  const phonemes: Phoneme[] = [];
  const unknownSymbols: string[] = [];
  let stressNext = false;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === PRIMARY_STRESS) {
      stressNext = true;
      i += 1;
      continue;
    }
    if (IGNORED.has(ch) || ch === 'ː') {
      i += 1;
      continue;
    }
    if (body.startsWith('ər', i) && !VOWEL_CHARS.test(body[i + 2] ?? '')) {
      phonemes.push({ code: 'er', stressed: stressNext });
      stressNext = false;
      i += 2;
      continue;
    }
    const vowel = VOWELS.find(([sym]) => body.startsWith(sym, i));
    if (vowel) {
      phonemes.push({ code: vowel[1], stressed: stressNext });
      // /ɪr/ は母音（iy）と子音（r）の2つの音素にする
      if (vowel[0] === 'ɪr') phonemes.push({ code: 'r', stressed: false });
      stressNext = false;
      i += vowel[0].length;
      continue;
    }
    const consonant = CONSONANTS.find(([sym]) => body.startsWith(sym, i));
    if (consonant) {
      phonemes.push({ code: consonant[1], stressed: false });
      i += consonant[0].length;
      continue;
    }
    unknownSymbols.push(ch);
    i += 1;
  }
  // 1音節の語（ˈ が無い）は最初の母音を強勢とする
  if (!phonemes.some((p) => p.stressed)) {
    const first = phonemes.find((p) => isVowelPhoneme(p.code));
    if (first) first.stressed = true;
  }
  return { phonemes, unknownSymbols };
}

/** 表示用。空・変換できない記号を含む場合は null（画面には出さない） */
export function ipaToPhonemes(ipa: string | null | undefined): Phoneme[] | null {
  if (!ipa?.trim()) return null;
  const { phonemes, unknownSymbols } = parseIpa(ipa);
  return unknownSymbols.length === 0 && phonemes.length > 0 ? phonemes : null;
}

/** 母音の数（音節の数との照合に使う） */
export const countVowelPhonemes = (phonemes: readonly Phoneme[]): number =>
  phonemes.filter((p) => isVowelPhoneme(p.code)).length;

/** 強勢のある母音が何番目の母音か（1始まり。母音が無ければ null） */
export function stressedVowelPosition(phonemes: readonly Phoneme[]): number | null {
  let n = 0;
  for (const p of phonemes) {
    if (!isVowelPhoneme(p.code)) continue;
    n += 1;
    if (p.stressed) return n;
  }
  return null;
}

/** 強勢のある母音から想定される Color Vowel（cv_id）。判定できなければ null */
export function expectedColorVowel(phonemes: readonly Phoneme[]): string | null {
  const idx = phonemes.findIndex((p) => p.stressed);
  if (idx < 0) return null;
  const { code } = phonemes[idx];
  if (phonemes[idx + 1]?.code === 'r' && R_COLORED_TO_CV[code]) return R_COLORED_TO_CV[code];
  return PHONEME_TO_CV[code] ?? null;
}
