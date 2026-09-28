/**
 * 결과 표시 포맷.
 *
 * 실기는 내부 15자리로 계산하고 화면에는 10자리 가수로 반올림해 보여 준다.
 * 이중 반올림 오차(2진 → 10진)를 피하려고, 값을 먼저 "정확한 유리수"로 만든 뒤
 * BigInt로 10진 자릿수를 뽑고 사사오입(half-up)한다.
 *   - rat  : 그 자체가 정확한 유리수
 *   - real : 이미 15자리로 반올림돼 있으므로 toPrecision(15)의 10진 문자열을 유리수로 읽는다
 */
import type { Value } from '../value/value';

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

const pow10 = (k: number) => 10n ** BigInt(k);
const digitLen = (a: bigint) => a.toString().length;

/** 값을 sig자리 유효숫자의 10진수로 (half-up 반올림) */
export function toDecimal(v: Value, sig: number): Decimal {
  let n: bigint;
  let d: bigint;
  if (v.k === 'rat') {
    n = v.n;
    d = v.d;
  } else {
    if (v.x === 0) return { neg: false, digits: '0', exp: 0 };
    const [m, e] = v.x.toExponential(14).split('e');
    const [ip, fp] = m.replace('-', '').split('.');
    n = BigInt(ip + fp) * (v.x < 0 ? -1n : 1n);
    const scale = Number(e) - 14; // 값 = n × 10^scale
    d = 1n;
    if (scale >= 0) n *= pow10(scale);
    else d = pow10(-scale);
  }
  if (n === 0n) return { neg: false, digits: '0', exp: 0 };

  const isNeg = n < 0n;
  const an = isNeg ? -n : n;

  // 지수 추정: |n|/d 의 10진 자릿수 차이. 실제 지수는 이 값이거나 1 작다.
  let exp = digitLen(an) - digitLen(d);
  const ge = (e: number) => (e >= 0 ? an >= d * pow10(e) : an * pow10(-e) >= d);
  if (!ge(exp)) exp--;

  // q = |v| × 10^(sig-1-exp) 를 반올림한 정수 → sig자리
  const k = sig - 1 - exp;
  const num = k >= 0 ? an * pow10(k) : an;
  const den = k >= 0 ? d : d * pow10(-k);
  let q = (2n * num + den) / (2n * den); // floor(x + 1/2) = half-up
  if (digitLen(q) > sig) {
    // 9.999… → 10.00 으로 자리올림된 경우
    q /= 10n;
    exp++;
  }
  return { neg: isNeg, digits: q.toString(), exp };
}

/**
 * Norm 1 표시 (실기 기본값): 10^-2 > |x| 또는 |x| ≥ 10^10 이면 지수 표기.
 * (Norm 2는 10^-9 > |x| 경계. 이후 SETUP 단계에서 추가)
 */
export function formatNorm(v: Value, norm: 1 | 2 = 1): FormattedNumber {
  const dec = toDecimal(v, 10);
  if (dec.digits === '0') return { neg: false, mantissa: '0', exponent: null };
  const low = norm === 1 ? -2 : -9;
  const trimmed = dec.digits.replace(/0+$/, '');

  if (dec.exp < low || dec.exp >= 10) {
    const mantissa = trimmed.length > 1 ? `${trimmed[0]}.${trimmed.slice(1)}` : trimmed;
    return { neg: dec.neg, mantissa, exponent: dec.exp };
  }
  let mantissa: string;
  if (dec.exp >= 0) {
    const intPart = trimmed.slice(0, dec.exp + 1).padEnd(dec.exp + 1, '0');
    const frac = trimmed.slice(dec.exp + 1);
    mantissa = frac ? `${intPart}.${frac}` : intPart;
  } else {
    mantissa = `0.${'0'.repeat(-dec.exp - 1)}${trimmed}`;
  }
  return { neg: dec.neg, mantissa, exponent: null };
}

export function formattedToText(f: FormattedNumber): string {
  return `${f.neg ? '-' : ''}${f.mantissa}${f.exponent !== null ? `×10^${f.exponent}` : ''}`;
}
