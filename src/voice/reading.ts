/**
 * 읽기 변환: 키 토큰 / 계산 결과 → 일본어 가나.
 *
 * 매핑 테이블(TOKEN_READING)만 고치면 읽는 방식을 바꿀 수 있다.
 * 긴 모음은 "ー"로 적는다 (きゅう → きゅー). 음원은 모라 단위라서 う를 따로 발음하지 않게 하려는 것.
 *
 * 결과 읽기 방식
 *   numeral : 수사로 읽기   1234.5 → せんにひゃくさんじゅーよん てん ご
 *   digits  : 한 자리씩     1234.5 → いち に さん よん てん ご
 */
import type { DisplayForm, FormattedNumber } from '../engine/format/display';
import type { TokenId } from '../engine/input/tokens';

export type ReadingStyle = 'numeral' | 'digits';

/** 한 번에 말할 내용. 단어 사이에는 짧은 쉼이 들어간다 */
export type Phrase = string[];

const DIGIT = ['ぜろ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅー'];

export const TOKEN_READING: Record<TokenId, string> = {
  '0': 'ぜろ', '1': 'いち', '2': 'に', '3': 'さん', '4': 'よん',
  '5': 'ご', '6': 'ろく', '7': 'なな', '8': 'はち', '9': 'きゅー',
  '.': 'てん',
  E: 'かけるじゅーの',
  '+': 'たす', '-': 'ひく', '*': 'かける', '/': 'わる',
  P: 'ぴー', C: 'しー', '⌟': 'ぶんの',
  neg: 'まいなす',
  '(': 'かっこ', ')': 'かっことじ', ',': 'かんま',
  'sin(': 'さいん', 'cos(': 'こさいん', 'tan(': 'たんじぇんと',
  'asin(': 'あーくさいん', 'acos(': 'あーくこさいん', 'atan(': 'あーくたんじぇんと',
  'sinh(': 'はいぱーさいん', 'cosh(': 'はいぱーこさいん', 'tanh(': 'はいぱーたんじぇんと',
  'asinh(': 'あーくはいぱーさいん', 'acosh(': 'あーくはいぱーこさいん', 'atanh(': 'あーくはいぱーたんじぇんと',
  'log(': 'ろぐ', 'ln(': 'えるえぬ', '10^(': 'じゅーのべき', 'e^(': 'いーのべき',
  '√(': 'るーと', '∛(': 'りっぽーこん',
  'Abs(': 'ぜったいち', 'Pol(': 'ぽーる', 'Rec(': 'れく', 'Rnd(': 'まるめ', 'RanInt#(': 'らんだむいんと',
  '^(': 'じょー', 'ˣ√(': 'じょーこん',
  sq: 'じじょー', cube: 'さんじょー', inv: 'ぎゃくすー', '!': 'かいじょー', '%': 'ぱーせんと',
  drgDeg: 'ど', drgRad: 'らじあん', drgGra: 'ぐらーど',
  '°': 'ど',
  π: 'ぱい', e: 'いー',
  A: 'えー', B: 'びー', Cv: 'しー', D: 'でぃー', Ev: 'いー', F: 'えふ', X: 'えっくす', Y: 'わい', M: 'えむ',
  Ans: 'あんさー',
  'Ran#': 'らんだむ',
};

const LABEL_READING: Record<string, string> = { r: 'あーる', θ: 'しーた', X: 'えっくす', Y: 'わい' };

// ------------------------------------------------------------------ 수사

/**
 * 0~9999 를 수사로. 일본어의 음 변화(연탁·촉음화)를 반영한다:
 *   300 さんびゃく, 600 ろっぴゃく, 800 はっぴゃく, 3000 さんぜん, 8000 はっせん
 *   1000 은 いっせん 이 아니라 せん, 100 은 ひゃく, 10 은 じゅー
 */
function under10000(n: number): string {
  const th = Math.floor(n / 1000);
  const hu = Math.floor(n / 100) % 10;
  const te = Math.floor(n / 10) % 10;
  const on = n % 10;
  let s = '';
  if (th) s += th === 1 ? 'せん' : th === 3 ? 'さんぜん' : th === 8 ? 'はっせん' : DIGIT[th] + 'せん';
  if (hu) s += hu === 1 ? 'ひゃく' : hu === 3 ? 'さんびゃく' : hu === 6 ? 'ろっぴゃく' : hu === 8 ? 'はっぴゃく' : DIGIT[hu] + 'ひゃく';
  if (te) s += te === 1 ? 'じゅー' : DIGIT[te] + 'じゅー';
  if (on) s += DIGIT[on];
  return s;
}

const UNITS = ['', 'まん', 'おく', 'ちょー'];

/** 정수 문자열(부호 없음)을 수사로. 4자리씩 끊어 만·억·조 */
export function readInteger(digits: string): string {
  const s = digits.replace(/^0+/, '');
  if (!s) return 'ぜろ';
  const out: string[] = [];
  for (let g = 0, end = s.length; end > 0; g++, end -= 4) {
    const v = Number(s.slice(Math.max(0, end - 4), end));
    if (v) out.unshift(under10000(v) + UNITS[g]);
  }
  return out.join('');
}

const digitsOf = (s: string) => [...s].map((c) => DIGIT[Number(c)] ?? '').join('');

/** 소수 문자열 (예: "1234.5") 읽기 */
export function readDecimal(text: string, style: ReadingStyle): string {
  const [ip, fp] = text.split('.');
  const intPart = style === 'numeral' ? readInteger(ip) : digitsOf(ip);
  return fp !== undefined ? `${intPart}てん${digitsOf(fp)}` : intPart;
}

function readNumber(f: FormattedNumber, style: ReadingStyle): Phrase {
  const words: Phrase = [];
  if (f.neg) words.push('まいなす');
  words.push(readDecimal(f.mantissa, style));
  if (f.exponent !== null) {
    const e = f.exponent;
    words.push('かけるじゅーの', `${e < 0 ? 'まいなす' : ''}${readInteger(String(Math.abs(e)))}じょー`);
  }
  return words;
}

export function readForm(form: DisplayForm, style: ReadingStyle): Phrase {
  const read = (s: string) => (style === 'numeral' ? readInteger(s) : digitsOf(s));
  switch (form.kind) {
    case 'num':
      return readNumber(form.num, style);
    case 'frac': {
      // 일본어 분수는 분모를 먼저: 2/3 → さんぶんのに
      const words: Phrase = form.neg ? ['まいなす'] : [];
      if (form.whole) words.push(read(form.whole) + 'と');
      words.push(read(form.den) + 'ぶんの', read(form.num));
      return words;
    }
    case 'dms':
      return [
        ...(form.neg ? ['まいなす'] : []),
        read(form.d) + 'ど',
        read(form.m) + 'ふん',
        readDecimal(form.s, style) + 'びょー',
      ];
    case 'pair':
      return form.items.flatMap((it) => [LABEL_READING[it.label] ?? '', 'いこーる', ...readNumber(it.num, style)]);
  }
}

export function readToken(id: TokenId): Phrase {
  return [TOKEN_READING[id]];
}

export const ERROR_READING: Phrase = ['えらー'];
export const EQUALS_READING = 'いこーる';
