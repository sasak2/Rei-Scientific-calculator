/**
 * 평가기: AST를 재귀적으로 내려가며 값을 계산한다.
 * 연산 자체는 value.ts의 함수들이 담당하고(유리수/실수 분기 포함), 여기서는 노드 종류만 분기한다.
 */
import type { BinaryOp, Node } from '../parse/ast';
import { add, div, fromDecimal, mul, neg, reciprocal, sub, type Value } from '../value/value';

export type AngleUnit = 'deg' | 'rad' | 'gra';

export interface EvalContext {
  ans: Value;
  angle: AngleUnit;
}

const BINARY: Record<BinaryOp, (a: Value, b: Value) => Value> = {
  '+': add,
  '-': sub,
  '*': mul,
  '/': div,
};

export function evaluate(node: Node, ctx: EvalContext): Value {
  switch (node.type) {
    case 'num':
      return fromDecimal(node.mantissa, node.exp10);
    case 'ans':
      return ctx.ans;
    case 'neg':
      return neg(evaluate(node.operand, ctx));
    case 'binary':
      return BINARY[node.op](evaluate(node.left, ctx), evaluate(node.right, ctx));
    case 'implicitMul':
      return mul(evaluate(node.left, ctx), evaluate(node.right, ctx));
    case 'postfix': {
      const v = evaluate(node.operand, ctx);
      return node.op === 'sq' ? mul(v, v) : reciprocal(v);
    }
  }
}
