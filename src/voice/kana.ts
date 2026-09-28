/**
 * 가나 문자열 → 모라(박) 단위.
 *
 * 일본어는 모라 하나가 대략 같은 길이로 발음된다. UTAU 단독음 음원도 모라 하나가 wav 하나다.
 *   きゅー → [きゅ(+길게)]   요음(ゃゅょ 등 작은 글자)은 앞 글자와 합쳐 한 모라
 *   はっせん → [は, (쉼), せ, ん]   촉음 っ 는 짧은 무음
 *   ー → 앞 모라를 한 박 늘인다
 */
export interface Mora {
  /** 음원 별칭으로 쓸 가나. 촉음(っ)은 null = 무음 */
  kana: string | null;
  /** 박 수 (ー 가 붙을 때마다 +1) */
  beats: number;
  vowel: Vowel | null;
}

export type Vowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'n';

const SMALL = 'ゃゅょぁぃぅぇぉゎ';

const VOWEL_ROWS: Record<Vowel, string> = {
  a: 'あかさたなはまやらわがざだばぱぁゃゎ',
  i: 'いきしちにひみりぎじぢびぴぃ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゅゔ',
  e: 'えけせてねへめれげぜでべぺぇ',
  o: 'おこそとのほもよろをごぞどぼぽぉょ',
  n: 'ん',
};

const VOWEL_OF = new Map<string, Vowel>();
for (const [v, chars] of Object.entries(VOWEL_ROWS) as [Vowel, string][]) for (const c of chars) VOWEL_OF.set(c, v);

/** 모라의 모음 = 마지막 글자의 모음 (きゅ → ゅ → u) */
export function vowelOf(kana: string): Vowel | null {
  return VOWEL_OF.get(kana[kana.length - 1]) ?? null;
}

export function splitMora(text: string): Mora[] {
  const out: Mora[] = [];
  for (const ch of text) {
    if (SMALL.includes(ch) && out.length && out[out.length - 1].kana) {
      const prev = out[out.length - 1];
      prev.kana += ch;
      prev.vowel = vowelOf(prev.kana!);
    } else if (ch === 'ー') {
      if (out.length) out[out.length - 1].beats++;
    } else if (ch === 'っ') {
      out.push({ kana: null, beats: 1, vowel: null });
    } else if (VOWEL_OF.has(ch)) {
      out.push({ kana: ch, beats: 1, vowel: vowelOf(ch) });
    }
    // 그 밖의 문자(공백 등)는 무시
  }
  return out;
}

/** 모음만 남긴 대체 별칭 (음원에 없는 모라를 만났을 때) */
export const VOWEL_KANA: Record<Vowel, string> = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お', n: 'ん' };
