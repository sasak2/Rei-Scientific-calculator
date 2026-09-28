/**
 * 계산 엔진의 값 표현 (하이브리드).
 *
 * 왜 하이브리드인가?
 *   JS number(IEEE 754 double)는 2진 부동소수점이라 0.1을 정확히 표현하지 못한다.
 *   그래서 0.1+0.2 = 0.30000000000000004 가 된다. 실기(fx-991ES)는 10진 BCD 연산을 하므로
 *   이런 오차가 없고, 1÷3×3 도 정확히 1이 나오며 분수 결과(⅓)를 그대로 보여 준다.
 *
 *   - 'rat'  : 분자/분모를 BigInt로 가진 기약분수. 사칙연산과 정수 거듭제곱에 대해 닫혀 있어
 *              유한소수 입력과 그 사칙연산은 오차 없이 계산된다.
 *   - 'real' : sin, log 같은 초월함수 결과는 유리수가 아니므로 double로 전환하고,
 *              매 연산 후 15자리 유효숫자로 반올림한다(실기의 15자리 가수를 흉내).
 *
 *   이후 단계에서 'cplx'(복소수), 'mat'/'vec', 'exact'(a√b/c, kπ)를 이 유니온에 추가한다.
 */
import { CalcError } from '../errors';

export type Rat = { readonly k: 'rat'; readonly n: bigint; readonly d: bigint };
export type Real = { readonly k: 'real'; readonly x: number };
export type Value = Rat | Real;

/** 분자·분모가 이 크기를 넘으면 유리수를 포기하고 real로 전환한다 (15자리 가수와 같은 한계). */
const RAT_LIMIT = 10n ** 15n;
/** 실기의 표현 범위: |x| < 10^100. 넘으면 Math ERROR, 10^-99 미만은 0으로 떨어진다. */
const MAX_ABS = 1e100;
const MIN_ABS = 1e-99;

export const ZERO: Rat = { k: 'rat', n: 0n, d: 1n };
export const ONE: Rat = { k: 'rat', n: 1n, d: 1n };

// ---------------------------------------------------------------- 생성

const abs = (a: bigint) => (a < 0n ? -a : a);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** 15자리 유효숫자 반올림. double은 약 15.95자리를 담으므로 15자리까지는 정보 손실이 없다. */
export function roundSig(x: number, sig = 15): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(sig));
}

export function real(x: number): Real {
  if (!Number.isFinite(x) || Math.abs(x) >= MAX_ABS) throw new CalcError('math');
  x = roundSig(x);
  if (Math.abs(x) < MIN_ABS) x = 0;
  // 반올림 결과가 경계에 걸릴 수 있으므로 다시 확인
  if (Math.abs(x) >= MAX_ABS) throw new CalcError('math');
  return { k: 'real', x: x === 0 ? 0 : x }; // -0 제거
}

/** 기약분수로 정규화한다. 너무 크면 real로 전환한다. */
export function rat(n: bigint, d: bigint = 1n): Value {
  if (d === 0n) throw new CalcError('math');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  if (g > 1n) {
    n /= g;
    d /= g;
  }
  if (abs(n) >= RAT_LIMIT || d >= RAT_LIMIT) return real(Number(n) / Number(d));
  return { k: 'rat', n, d };
}

/**
 * 숫자 리터럴(가수 문자열 + 10의 지수)을 값으로 만든다.
 * 예: mantissa "12.5", exp -3  →  12.5×10^-3 = 125/10000 = 1/80
 */
export function fromDecimal(mantissa: string, exp10 = 0): Value {
  const [ip, fp = ''] = mantissa.split('.');
  const digits = BigInt((ip || '0') + fp);
  const scale = exp10 - fp.length; // 값 = digits × 10^scale
  if (Math.abs(scale) > 120) return real(Number(`${mantissa}e${exp10}`));
  return scale >= 0 ? rat(digits * 10n ** BigInt(scale)) : rat(digits, 10n ** BigInt(-scale));
}

export function toNumber(v: Value): number {
  return v.k === 'rat' ? Number(v.n) / Number(v.d) : v.x;
}

export function isZero(v: Value): boolean {
  return v.k === 'rat' ? v.n === 0n : v.x === 0;
}

// ---------------------------------------------------------------- 사칙연산
// 두 피연산자가 모두 유리수면 정확하게, 하나라도 real이면 double로 계산한다.

export function add(a: Value, b: Value): Value {
  if (a.k === 'rat' && b.k === 'rat') return rat(a.n * b.d + b.n * a.d, a.d * b.d);
  return real(toNumber(a) + toNumber(b));
}

export function neg(a: Value): Value {
  return a.k === 'rat' ? { k: 'rat', n: -a.n, d: a.d } : real(-a.x);
}

export function sub(a: Value, b: Value): Value {
  return add(a, neg(b));
}

export function mul(a: Value, b: Value): Value {
  if (a.k === 'rat' && b.k === 'rat') return rat(a.n * b.n, a.d * b.d);
  return real(toNumber(a) * toNumber(b));
}

export function div(a: Value, b: Value): Value {
  if (isZero(b)) throw new CalcError('math');
  if (a.k === 'rat' && b.k === 'rat') return rat(a.n * b.d, a.d * b.n);
  return real(toNumber(a) / toNumber(b));
}

export function reciprocal(a: Value): Value {
  return div(ONE, a);
}
