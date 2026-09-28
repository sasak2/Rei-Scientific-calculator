/**
 * 각도 단위와 삼각함수.
 *
 * ── 왜 도(°) 단위로 먼저 바꾸는가? ────────────────────────────────────
 * Math.sin은 라디안을 받는데, π는 2진수로 정확히 표현되지 않는다.
 * 그래서 Math.sin(Math.PI) = 1.22e-16 이 되고, 15자리 반올림으로도 0이 되지 않는다.
 * 실기는 sin(180) = 0, tan(90) = Math ERROR 처럼 특수각을 정확히 처리한다.
 *
 * 그래서 모든 각을 먼저 "도"로 바꾸고(라디안이면 15자리 반올림 → π가 정확히 180이 된다),
 * 360으로 나눈 나머지가 30°/45°/90°의 배수면 표에서 정확한 값을 꺼낸다.
 * 그 외의 각만 라디안으로 바꿔 Math.sin을 쓴다.
 */
import { CalcError } from '../errors';
import { div, fromDecimal, mul, rat, real, toNumber, type Value } from '../value/value';

export type AngleUnit = 'deg' | 'rad' | 'gra';

/** 실기의 삼각함수 입력 한계: |x| < 9×10^9 도 */
const MAX_DEG = 9e9;

const R180_PI = 180 / Math.PI;

export function toDegrees(v: Value, unit: AngleUnit): Value {
  switch (unit) {
    case 'deg':
      return v;
    case 'rad':
      return real(toNumber(v) * R180_PI);
    case 'gra':
      return mul(v, rat(9n, 10n));
  }
}

export function fromDegrees(deg: Value, unit: AngleUnit): Value {
  switch (unit) {
    case 'deg':
      return deg;
    case 'rad':
      return real(toNumber(deg) / R180_PI);
    case 'gra':
      return div(deg, rat(9n, 10n));
  }
}

/** DRG▶ 기호가 붙은 값(from 단위)을 현재 단위(to)로 변환 */
export function convertAngle(v: Value, from: AngleUnit, to: AngleUnit): Value {
  return from === to ? v : fromDegrees(toDegrees(v, from), to);
}

/**
 * [0, 360) 으로 줄인 도 값. 유리수면 정확하게, 아니면 double로.
 * 반환값 `mult`: 30° 또는 45°의 정수배라면 그 배수 (특수각 판정용)
 */
function reduce(deg: Value): { d: number; m30: number | null; m45: number | null } {
  if (Math.abs(toNumber(deg)) >= MAX_DEG) throw new CalcError('math');
  if (deg.k === 'rat') {
    const full = 360n * deg.d;
    let n = deg.n % full;
    if (n < 0n) n += full;
    const r = { k: 'rat', n, d: deg.d } as const;
    const d = Number(n) / Number(deg.d);
    const m30 = (n % (30n * r.d) === 0n) ? Number(n / (30n * r.d)) : null;
    const m45 = (n % (45n * r.d) === 0n) ? Number(n / (45n * r.d)) : null;
    return { d, m30, m45 };
  }
  let d = deg.x % 360;
  if (d < 0) d += 360;
  d = Number(d.toPrecision(15));
  if (d === 360) d = 0;
  return {
    d,
    m30: Number.isInteger(d / 30) ? d / 30 : null,
    m45: Number.isInteger(d / 45) ? d / 45 : null,
  };
}

const HALF = rat(1n, 2n);
const NEG_HALF = rat(-1n, 2n);
const SQRT2_2 = Math.SQRT1_2;

/** sin의 특수각 표: 30°·45° 배수 */
function sinSpecial(m30: number | null, m45: number | null): Value | null {
  if (m30 !== null) {
    // 0,30,60,90,…,330  (60°, 120° 등은 √3/2라서 유리수가 아님 → 일반 계산으로)
    const table: (Value | null)[] = [rat(0n), HALF, null, rat(1n), null, HALF, rat(0n), NEG_HALF, null, rat(-1n), null, NEG_HALF];
    return table[m30];
  }
  if (m45 !== null) {
    // 45,135,225,315 (90의 배수는 위에서 처리됨)
    return real([SQRT2_2, SQRT2_2, -SQRT2_2, -SQRT2_2][(m45 - 1) / 2]);
  }
  return null;
}

export function sinDeg(deg: Value): Value {
  const { d, m30, m45 } = reduce(deg);
  return sinSpecial(m30, m45) ?? real(Math.sin(d / R180_PI));
}

export function cosDeg(deg: Value): Value {
  // cos θ = sin(θ + 90°)
  const shifted = deg.k === 'rat' ? rat(deg.n + 90n * deg.d, deg.d) : real(deg.x + 90);
  return sinDeg(shifted);
}

export function tanDeg(deg: Value): Value {
  const { d, m45 } = reduce(deg);
  if (m45 !== null) {
    if (m45 % 2 === 0 && (m45 / 2) % 2 === 1) throw new CalcError('math'); // 90°, 270°
    return rat([0n, 1n, 0n, -1n, 0n, 1n, 0n, -1n][m45]);
  }
  return real(Math.tan(d / R180_PI));
}

/** 역삼각함수 결과(라디안 double)를 현재 단위로 */
export function radToUnit(r: number, unit: AngleUnit): Value {
  const deg = real(r * R180_PI); // 15자리 반올림으로 30.000000000000004 → 30
  return fromDegrees(deg, unit);
}

export function dmsToValue(parts: string[]): Value {
  // d + m/60 + s/3600  (정확한 유리수)
  const [d, m = '0', s = '0'] = parts;
  const deg = fromDecimal(d);
  const min = div(fromDecimal(m), rat(60n));
  const sec = div(fromDecimal(s), rat(3600n));
  const sum = [deg, min, sec].reduce((a, b) => (a.k === 'rat' && b.k === 'rat' ? rat(a.n * b.d + b.n * a.d, a.d * b.d) : real(toNumber(a) + toNumber(b))));
  return sum;
}
