/**
 * 결과 표시 포맷.
 *
 * 실기는 내부 15자리로 계산하고 화면에는 10자리 가수로 반올림해 보여 준다.
 * 이중 반올림 오차(2진 → 10진)를 피하려고, 값을 먼저 "정확한 유리수"로 만든 뒤
 * BigInt로 10진 자릿수를 뽑고 사사오입(half-up)한다.
 *   - rat  : 그 자체가 정확한 유리수
 *   - real : 이미 15자리로 반올림돼 있으므로 toExponential(14)의 10진 문자열을 유리수로 읽는다
 *
 * 표시 형식 (SETUP):
 *   Norm 1 : 10^-2 > |x| 또는 |x| ≥ 10^10 이면 지수 표기 (기본값)
 *   Norm 2 : 10^-9 > |x| 또는 |x| ≥ 10^10 이면 지수 표기
 *   Fix n  : 소수점 아래 n자리 고정 (0~9)
 *   Sci n  : 유효숫자 n자리 지수 표기 (1~10)
 * 그 밖에 ENG(지수를 3의 배수로), 분수(⌟), 60진법(°'") 표시가 있다.
 */
import { asRational, type Rat, type Value } from '../value/value';

export interface Decimal {
  neg: boolean;
  /** 유효숫자 (첫 자리는 0이 아님). 값이 0이면 '0' */
  digits: string;
  /** 값 = d1.d2d3… × 10^exp */
  exp: number;
}

export interface FormattedNumber {
  neg: boolean;
  /** "1.234", "0.05" 처럼 부호를 뺀 가수 */
  mantissa: string;
  /** 지수 표기일 때만 값이 있음 (×10^exponent) */
  exponent: number | null;
}

export type NumberFormat = { mode: 'norm'; n: 1 | 2 } | { mode: 'fix'; n: number } | { mode: 'sci'; n: number };

export type DisplayForm =
  | { kind: 'num'; num: FormattedNumber }
  | { kind: 'frac'; neg: boolean; whole?: string; num: string; den: string }
  | { kind: 'dms'; neg: boolean; d: string; m: string; s: string }
  | { kind: 'pair'; items: { label: string; num: FormattedNumber }[] };

/** 화면 가수 자릿수 */
const DIGITS = 10;

const pow10 = (k: number) => 10n ** BigInt(k);
const digitLen = (a: bigint) => a.toString().length;

/** 값을 정확한 유리수 (n/d, d>0) 로. real은 10진 15자리 문자열을 그대로 유리수로 읽는다. */
function exactRatio(v: Value): { n: bigint; d: bigint } {
  if (v.k === 'rat') return { n: v.n, d: v.d };
  if (v.x === 0) return { n: 0n, d: 1n };
  const [m, e] = v.x.toExponential(14).split('e');
  const [ip, fp] = m.replace('-', '').split('.');
  let n = BigInt(ip + fp) * (v.x < 0 ? -1n : 1n);
  const scale = Number(e) - 14; // 값 = n × 10^scale
  let d = 1n;
  if (scale >= 0) n *= pow10(scale);
  else d = pow10(-scale);
  return { n, d };
}

/** 사사오입 나눗셈: round_half_up(num / den), num,den ≥ 0 */
const roundDiv = (num: bigint, den: bigint) => (2n * num + den) / (2n * den);

/** 값을 sig자리 유효숫자의 10진수로 (half-up 반올림) */
export function toDecimal(v: Value, sig: number): Decimal {
  const { n, d } = exactRatio(v);
  if (n === 0n) return { neg: false, digits: '0', exp: 0 };

  const isNeg = n < 0n;
  const an = isNeg ? -n : n;

  // 지수 추정: |n|/d 의 10진 자릿수 차이. 실제 지수는 이 값이거나 1 작다.
  let exp = digitLen(an) - digitLen(d);
  const ge = (e: number) => (e >= 0 ? an >= d * pow10(e) : an * pow10(-e) >= d);
  if (!ge(exp)) exp--;

  // q = |v| × 10^(sig-1-exp) 를 반올림한 정수 → sig자리
  const k = sig - 1 - exp;
  let q = k >= 0 ? roundDiv(an * pow10(k), d) : roundDiv(an, d * pow10(-k));
  if (digitLen(q) > sig) {
    // 9.999… → 10.00 으로 자리올림된 경우
    q /= 10n;
    exp++;
  }
  return { neg: isNeg, digits: q.toString(), exp };
}

const trimZeros = (s: string) => s.replace(/0+$/, '');

function sciFrom(dec: Decimal, keepZeros = false): FormattedNumber {
  const digits = keepZeros ? dec.digits : trimZeros(dec.digits) || '0';
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return { neg: dec.neg, mantissa, exponent: dec.exp };
}

/** 지수 없이 고정소수점으로 풀어 쓴다 (dec.digits의 유효숫자 그대로) */
function fixedFrom(dec: Decimal, keepZeros = false): FormattedNumber {
  const digits = keepZeros ? dec.digits : trimZeros(dec.digits);
  let mantissa: string;
  if (dec.exp >= 0) {
    const intPart = digits.slice(0, dec.exp + 1).padEnd(dec.exp + 1, '0');
    const frac = digits.slice(dec.exp + 1);
    mantissa = frac ? `${intPart}.${frac}` : intPart;
  } else {
    mantissa = `0.${'0'.repeat(-dec.exp - 1)}${digits}`;
  }
  return { neg: dec.neg, mantissa, exponent: null };
}

const ZERO_NUM: FormattedNumber = { neg: false, mantissa: '0', exponent: null };

export function formatNorm(v: Value, norm: 1 | 2 = 1): FormattedNumber {
  const dec = toDecimal(v, DIGITS);
  if (dec.digits === '0') return ZERO_NUM;
  const low = norm === 1 ? -2 : -9;
  return dec.exp < low || dec.exp >= DIGITS ? sciFrom(dec) : fixedFrom(dec);
}

/** Fix n: 소수점 아래 n자리. 정수부가 길면 소수 자릿수를 줄이고, 10자리를 넘으면 지수 표기. */
export function formatFix(v: Value, n: number): FormattedNumber {
  const probe = toDecimal(v, 15);
  if (probe.digits !== '0' && probe.exp >= DIGITS) return sciFrom(toDecimal(v, DIGITS));
  const intDigits = Math.max(1, probe.exp + 1);
  const places = Math.min(n, Math.max(0, DIGITS - intDigits));
  const { n: num, d } = exactRatio(v);
  const neg = num < 0n;
  const q = roundDiv((neg ? -num : num) * pow10(places), d);
  let s = q.toString().padStart(places + 1, '0');
  if (places > 0) s = `${s.slice(0, -places)}.${s.slice(-places)}`;
  return { neg: neg && q !== 0n, mantissa: s, exponent: null };
}

/** Sci n: 유효숫자 n자리 (n=10은 실기의 "Sci 0"). 끝의 0도 남긴다. */
export function formatSci(v: Value, n: number): FormattedNumber {
  const dec = toDecimal(v, n);
  if (dec.digits === '0') return { neg: false, mantissa: n > 1 ? `0.${'0'.repeat(n - 1)}` : '0', exponent: 0 };
  return sciFrom(dec, true);
}

export function formatNumber(v: Value, fmt: NumberFormat): FormattedNumber {
  switch (fmt.mode) {
    case 'norm':
      return formatNorm(v, fmt.n);
    case 'fix':
      return formatFix(v, fmt.n);
    case 'sci':
      return formatSci(v, fmt.n);
  }
}

/** 표준 ENG 지수: 가수가 1 ≤ |m| < 1000 이 되는 3의 배수 */
export function engExponent(v: Value): number {
  const dec = toDecimal(v, DIGITS);
  return dec.digits === '0' ? 0 : Math.floor(dec.exp / 3) * 3;
}

/** ENG 표시: 지정한 지수(3의 배수)로 가수를 맞춘다. 가수는 최대 10자리 유효숫자. */
export function formatEng(v: Value, exponent: number): FormattedNumber {
  const dec = toDecimal(v, DIGITS);
  if (dec.digits === '0') return { neg: false, mantissa: '0', exponent };
  const shifted: Decimal = { ...dec, exp: dec.exp - exponent };
  return { ...fixedFrom(shifted), exponent };
}

/**
 * 분수 표시. 실기 규칙: 정수부·분자·분모와 구분 기호(⌟)를 합쳐 10자리 이내일 때만 분수로 보인다.
 * 넘으면 null → 소수로 표시한다.
 */
export function formatFraction(v: Value, mixed: boolean): DisplayForm | null {
  const r: Rat | null = asRational(v);
  if (!r) return null;
  const neg = r.n < 0n;
  const n = neg ? -r.n : r.n;
  const d = r.d;
  if (d === 1n) return null; // 정수는 분수로 보이지 않는다
  if (mixed && n > d) {
    const whole = (n / d).toString();
    const num = (n % d).toString();
    const den = d.toString();
    if (whole.length + num.length + den.length + 2 > DIGITS) return null;
    return { kind: 'frac', neg, whole, num, den };
  }
  const num = n.toString();
  const den = d.toString();
  if (num.length + den.length + 1 > DIGITS) return null;
  return { kind: 'frac', neg, num, den };
}

/** 60진법 표시: 도°분°초°. 초는 소수 둘째 자리까지 반올림 */
export function formatDMS(v: Value): DisplayForm | null {
  const { n, d } = exactRatio(v);
  const neg = n < 0n;
  const an = neg ? -n : n;
  // 전체를 1/100초 단위 정수로: |v| × 3600 × 100
  const cs = roundDiv(an * 360000n, d);
  const deg = cs / 360000n;
  if (deg >= 10n ** 7n) return null;
  const min = (cs / 6000n) % 60n;
  const csec = cs % 6000n;
  const sec = trimZeros(`${csec / 100n}.${(csec % 100n).toString().padStart(2, '0')}`).replace(/\.$/, '');
  return { kind: 'dms', neg, d: deg.toString(), m: min.toString(), s: sec };
}

export function numberToText(f: FormattedNumber): string {
  return `${f.neg ? '-' : ''}${f.mantissa}${f.exponent !== null ? `×10^${f.exponent}` : ''}`;
}

/** 표시 내용을 한 줄 텍스트로 (테스트·접근성·음성 입력용) */
export function formToText(form: DisplayForm): string {
  switch (form.kind) {
    case 'num':
      return numberToText(form.num);
    case 'frac':
      return `${form.neg ? '-' : ''}${form.whole ? `${form.whole}⌟` : ''}${form.num}⌟${form.den}`;
    case 'dms':
      return `${form.neg ? '-' : ''}${form.d}°${form.m}°${form.s}°`;
    case 'pair':
      return form.items.map((it) => `${it.label}=${numberToText(it.num)}`).join(',');
  }
}
