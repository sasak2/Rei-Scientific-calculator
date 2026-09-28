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

// ---------------------------------------------------------------- 비교 · 판정

export function sign(v: Value): -1 | 0 | 1 {
  const s = v.k === 'rat' ? (v.n > 0n ? 1 : v.n < 0n ? -1 : 0) : Math.sign(v.x);
  return s as -1 | 0 | 1;
}

/** 정수이면 BigInt, 아니면 null. real도 정확히 정수면 인정한다(예: sin⁻¹ 결과 30). */
export function asInteger(v: Value): bigint | null {
  if (v.k === 'rat') return v.d === 1n ? v.n : null;
  return Number.isInteger(v.x) && Math.abs(v.x) < 2 ** 53 ? BigInt(v.x) : null;
}

export function isInteger(v: Value): boolean {
  return asInteger(v) !== null;
}

// ---------------------------------------------------------------- 거듭제곱 · 거듭제곱근

/** 정수 제곱근 (뉴턴법). 완전제곱 판정에 쓴다. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  // double로 얻은 근삿값을 정수 뉴턴 반복으로 보정: x ← (x + n/x) / 2
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x && y * y <= n) {
      while ((x + 1n) * (x + 1n) <= n) x++;
      while (x * x > n) x--;
      return x;
    }
    x = y;
  }
}

/** 정수 k제곱근이 정확히 존재하면 반환 */
function exactRoot(n: bigint, k: number): bigint | null {
  if (n < 0n) return null;
  if (k === 2) {
    const r = isqrt(n);
    return r * r === n ? r : null;
  }
  const r = BigInt(Math.round(Number(n) ** (1 / k)));
  for (const c of [r - 1n, r, r + 1n]) if (c >= 0n && c ** BigInt(k) === n) return c;
  return null;
}

/**
 * √ : 유리수의 분자·분모가 모두 완전제곱이면 정확한 유리수로 (√(4/9) = 2/3).
 * 음수는 COMP 모드에서 Math ERROR (복소수는 CMPLX 모드, 3단계).
 */
export function sqrt(v: Value): Value {
  if (sign(v) < 0) throw new CalcError('math');
  if (v.k === 'rat') {
    const n = exactRoot(v.n, 2);
    const d = exactRoot(v.d, 2);
    if (n !== null && d !== null) return rat(n, d);
  }
  return real(Math.sqrt(toNumber(v)));
}

/** k제곱근 (k는 정수). 홀수 제곱근은 음수도 허용: ∛(-8) = -2 */
export function nthRoot(v: Value, k: bigint): Value {
  if (k === 0n) throw new CalcError('math');
  if (k < 0n) return reciprocal(nthRoot(v, -k));
  const odd = k % 2n === 1n;
  const s = sign(v);
  if (s < 0 && !odd) throw new CalcError('math');
  if (s === 0) return ZERO;
  const kn = Number(k);
  if (v.k === 'rat' && kn <= 64) {
    const an = v.n < 0n ? -v.n : v.n;
    const n = exactRoot(an, kn);
    const d = exactRoot(v.d, kn);
    if (n !== null && d !== null) return rat(s < 0 ? -n : n, d);
  }
  const r = Math.abs(toNumber(v)) ** (1 / kn);
  return real(s < 0 ? -r : r);
}

/**
 * x^y
 *  - y가 정수: 반복 제곱(지수가 크지 않을 때)으로 정확하게
 *  - y가 유리수 p/q: x^(p/q) = (q제곱근 x)^p. q가 홀수면 음수 밑도 허용 ((-8)^(1/3) = -2)
 *  - 그 외: double
 * 0^0, 0^(음수)는 Math ERROR
 */
export function pow(x: Value, y: Value): Value {
  const yi = asInteger(y);
  if (isZero(x)) {
    if (sign(y) <= 0) throw new CalcError('math');
    return ZERO;
  }
  if (yi !== null && x.k === 'rat' && (yi < 0n ? -yi : yi) <= 400n) {
    const e = yi < 0n ? -yi : yi;
    const r = rat(x.n ** e, x.d ** e);
    return yi < 0n ? reciprocal(r) : r;
  }
  if (y.k === 'rat' && y.d !== 1n && y.d <= 1000n) {
    // 유리수 지수: 밑을 먼저 q제곱근
    return pow(nthRoot(x, y.d), rat(y.n));
  }
  const xv = toNumber(x);
  const yv = toNumber(y);
  if (xv < 0 && yi === null) throw new CalcError('math');
  return real(xv ** yv);
}

// ---------------------------------------------------------------- 실수 → 분수 근사

/**
 * 연분수 전개로 double을 분모가 작은 분수로 되돌린다.
 * 예) 0.333333333333333 (15자리) → 1/3
 *
 * x = a0 + 1/(a1 + 1/(a2 + …)) 로 전개하면서 수렴분수 h/k 를 만든다:
 *   h_n = a_n·h_{n-1} + h_{n-2},  k_n = a_n·k_{n-1} + k_{n-2}
 * 수렴분수는 주어진 분모 한계에서 가장 좋은 근사라서, 상대오차가 15자리 반올림 오차
 * 수준(tol) 안에 들어오는 첫 수렴분수를 채택한다.
 */
export function rationalize(x: number, maxDen = 10n ** 10n, tol = 5e-15): Rat | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return { k: 'rat', n: BigInt(x), d: 1n };
  const neg = x < 0;
  let r = Math.abs(x);
  let [h0, h1] = [0n, 1n];
  let [k0, k1] = [1n, 0n];
  for (let iter = 0; iter < 64; iter++) {
    const a = Math.floor(r);
    if (a > 1e15) break;
    const ab = BigInt(a);
    [h0, h1] = [h1, ab * h1 + h0];
    [k0, k1] = [k1, ab * k1 + k0];
    if (k1 > maxDen) return null;
    const approx = Number(h1) / Number(k1);
    if (Math.abs(approx - Math.abs(x)) <= tol * Math.abs(x)) {
      return { k: 'rat', n: neg ? -h1 : h1, d: k1 };
    }
    const frac = r - a;
    if (frac < 1e-18) break;
    r = 1 / frac;
  }
  return null;
}

/** 값의 정확한 유리수 표현 (rat은 그대로, real은 연분수로 추정) */
export function asRational(v: Value): Rat | null {
  return v.k === 'rat' ? v : rationalize(v.x);
}
