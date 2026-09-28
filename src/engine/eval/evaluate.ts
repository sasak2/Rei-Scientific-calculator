/**
 * 평가기: AST를 재귀적으로 내려가며 값을 계산한다.
 * 연산 자체는 value.ts(유리수/실수 분기)와 angle.ts(삼각함수)가 담당하고,
 * 여기서는 노드 종류와 함수 이름에 따라 분기하고 정의역(Math ERROR)을 검사한다.
 */
import { CalcError } from '../errors';
import type { VarName } from '../input/tokens';
import type { BinaryOp, FuncName, Node, PostfixOp } from '../parse/ast';
import {
  add,
  asInteger,
  div,
  fromDecimal,
  mul,
  neg,
  nthRoot,
  pow,
  rat,
  real,
  reciprocal,
  sign,
  sqrt,
  sub,
  toNumber,
  type Value,
} from '../value/value';
import { convertAngle, cosDeg, dmsToValue, radToUnit, sinDeg, tanDeg, toDegrees, type AngleUnit } from './angle';

export type { AngleUnit } from './angle';

export interface EvalContext {
  ans: Value;
  angle: AngleUnit;
  vars: Record<VarName, Value>;
  /** Rnd( : 현재 표시 형식(Fix/Sci/Norm) 자릿수로 반올림 */
  rnd: (v: Value) => Value;
  /** [0,1) 난수. 테스트에서 고정값을 넣을 수 있게 주입받는다 */
  random: () => number;
}

export const PI: Value = real(Math.PI);
export const E: Value = real(Math.E);

/** 계승의 한계: 69! ≈ 1.7×10^98 까지 (70!은 10^100을 넘는다) */
const FACT_MAX = 69n;

function factorial(v: Value): Value {
  const n = asInteger(v);
  if (n === null || n < 0n || n > FACT_MAX) throw new CalcError('math');
  let r = 1n;
  for (let k = 2n; k <= n; k++) r *= k;
  return rat(r);
}

/** nPr = n!/(n-r)!,  nCr = nPr / r!  (0 ≤ r ≤ n < 10^10, 정수) */
function perm(nv: Value, rv: Value, combination: boolean): Value {
  const n = asInteger(nv);
  const r = asInteger(rv);
  if (n === null || r === null || r < 0n || n < r || n >= 10n ** 10n) throw new CalcError('math');
  const k = combination && r > n - r ? n - r : r; // nCr = nC(n-r): 곱셈 횟수를 줄인다
  let num = 1n;
  let den = 1n;
  for (let i = 0n; i < k; i++) {
    num *= n - i;
    if (combination) den *= i + 1n;
    if (num > 10n ** 120n) throw new CalcError('math');
  }
  return rat(num / den);
}

const BINARY: Record<BinaryOp, (a: Value, b: Value) => Value> = {
  '+': add,
  '-': sub,
  '*': mul,
  '/': div,
  P: (a, b) => perm(a, b, false),
  C: (a, b) => perm(a, b, true),
  '^': pow,
  // x ˣ√ y = y^(1/x)
  root: (x, y) => {
    const k = asInteger(x);
    return k !== null ? nthRoot(y, k) : pow(y, reciprocal(x));
  },
};

function postfix(op: PostfixOp, v: Value, ctx: EvalContext): Value {
  switch (op) {
    case 'sq':
      return mul(v, v);
    case 'cube':
      return mul(mul(v, v), v);
    case 'inv':
      return reciprocal(v);
    case '!':
      return factorial(v);
    case '%':
      return div(v, rat(100n));
    case 'drgDeg':
      return convertAngle(v, 'deg', ctx.angle);
    case 'drgRad':
      return convertAngle(v, 'rad', ctx.angle);
    case 'drgGra':
      return convertAngle(v, 'gra', ctx.angle);
  }
}

const ARITY: Record<FuncName, [min: number, max: number]> = {
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1],
  sinh: [1, 1], cosh: [1, 1], tanh: [1, 1], asinh: [1, 1], acosh: [1, 1], atanh: [1, 1],
  log: [1, 2], ln: [1, 1], pow10: [1, 1], exp: [1, 1], sqrt: [1, 1], cbrt: [1, 1], abs: [1, 1],
  pol: [2, 2], rec: [2, 2], rnd: [1, 1], ranint: [2, 2],
};

/** 밑이 10인 로그. 10의 거듭제곱인 유리수는 정확한 정수로 */
function log10(v: Value): Value {
  if (sign(v) <= 0) throw new CalcError('math');
  if (v.k === 'rat') {
    const exact = (n: bigint) => {
      const s = n.toString();
      return /^10*$/.test(s) ? s.length - 1 : null;
    };
    const a = exact(v.n);
    const b = exact(v.d);
    if (a !== null && b !== null) return rat(BigInt(a - b));
  }
  return real(Math.log10(toNumber(v)));
}

function ln(v: Value): number {
  if (sign(v) <= 0) throw new CalcError('math');
  return Math.log(toNumber(v));
}

function domain(ok: boolean): void {
  if (!ok) throw new CalcError('math');
}

function call(fn: FuncName, args: Value[], ctx: EvalContext): Value {
  const [a, b] = args;
  const x = () => toNumber(a);
  switch (fn) {
    case 'sin':
      return sinDeg(toDegrees(a, ctx.angle));
    case 'cos':
      return cosDeg(toDegrees(a, ctx.angle));
    case 'tan':
      return tanDeg(toDegrees(a, ctx.angle));
    case 'asin':
      domain(Math.abs(x()) <= 1);
      return radToUnit(Math.asin(x()), ctx.angle);
    case 'acos':
      domain(Math.abs(x()) <= 1);
      return radToUnit(Math.acos(x()), ctx.angle);
    case 'atan':
      return radToUnit(Math.atan(x()), ctx.angle);
    case 'sinh':
      return real(Math.sinh(x()));
    case 'cosh':
      return real(Math.cosh(x()));
    case 'tanh':
      return real(Math.tanh(x()));
    case 'asinh':
      return real(Math.asinh(x()));
    case 'acosh':
      domain(x() >= 1);
      return real(Math.acosh(x()));
    case 'atanh':
      domain(Math.abs(x()) < 1);
      return real(Math.atanh(x()));
    case 'log':
      if (b === undefined) return log10(a);
      // log(a, b) = 밑 a, 진수 b.  ln b / ln a  (a > 0, a ≠ 1, b > 0)
      domain(!(toNumber(a) === 1));
      return real(ln(b) / ln(a));
    case 'ln':
      return real(ln(a));
    case 'pow10':
      return pow(rat(10n), a);
    case 'exp':
      return real(Math.exp(x()));
    case 'sqrt':
      return sqrt(a);
    case 'cbrt':
      return nthRoot(a, 3n);
    case 'abs':
      return sign(a) < 0 ? neg(a) : a;
    case 'rnd':
      return ctx.rnd(a);
    case 'ranint': {
      const lo = asInteger(a);
      const hi = asInteger(b);
      if (lo === null || hi === null || lo >= hi) throw new CalcError('math');
      const span = Number(hi - lo + 1n);
      return rat(lo + BigInt(Math.floor(ctx.random() * span)));
    }
    case 'pol':
    case 'rec':
      // Pol/Rec는 결과가 두 개라서 식 전체일 때만 허용된다 (evaluatePair)
      throw new CalcError('syntax');
  }
}

export function evaluate(node: Node, ctx: EvalContext): Value {
  switch (node.type) {
    case 'num':
      return fromDecimal(node.mantissa, node.exp10);
    case 'dms':
      return dmsToValue(node.parts);
    case 'const':
      return node.name === 'π' ? PI : E;
    case 'var':
      return ctx.vars[node.name];
    case 'ans':
      return ctx.ans;
    case 'ran':
      // Ran# : 0.000 ~ 0.999 의 3자리 난수
      return rat(BigInt(Math.floor(ctx.random() * 1000)), 1000n);
    case 'neg':
      return neg(evaluate(node.operand, ctx));
    case 'binary':
      return BINARY[node.op](evaluate(node.left, ctx), evaluate(node.right, ctx));
    case 'implicitMul':
      return mul(evaluate(node.left, ctx), evaluate(node.right, ctx));
    case 'postfix':
      return postfix(node.op, evaluate(node.operand, ctx), ctx);
    case 'frac': {
      const f = div(evaluate(node.num, ctx), evaluate(node.den, ctx));
      return node.whole ? add(evaluate(node.whole, ctx), f) : f;
    }
    case 'call': {
      const [min, max] = ARITY[node.fn];
      if (node.args.length < min || node.args.length > max) throw new CalcError('syntax');
      return call(
        node.fn,
        node.args.map((a) => evaluate(a, ctx)),
        ctx,
      );
    }
  }
}

/**
 * Pol(x, y) → r, θ   /   Rec(r, θ) → x, y
 * 결과가 두 개라 식 전체가 Pol/Rec 하나일 때만 허용한다. 두 값은 변수 X, Y에 저장된다(실기 동작).
 */
export function evaluatePair(node: Node, ctx: EvalContext): [Value, Value] | null {
  if (node.type !== 'call' || (node.fn !== 'pol' && node.fn !== 'rec')) return null;
  if (node.args.length !== 2) throw new CalcError('syntax');
  const [a, b] = node.args.map((n) => evaluate(n, ctx));
  if (node.fn === 'pol') {
    const r = sqrt(add(mul(a, a), mul(b, b)));
    const theta = radToUnit(Math.atan2(toNumber(b), toNumber(a)), ctx.angle);
    return [r, theta];
  }
  const deg = toDegrees(b, ctx.angle);
  return [mul(a, cosDeg(deg)), mul(a, sinDeg(deg))];
}
