/**
 * Pratt 파서 (Top-Down Operator Precedence, Vaughan Pratt 1973).
 *
 * ── 원리 ──────────────────────────────────────────────────────────────
 * 재귀 하강 파서는 우선순위 단계마다 함수를 하나씩 둔다 (expr → term → factor …).
 * fx-991ES는 단계가 10개 가까이 되고 전위/후위 연산자가 섞여 있어 그 방식은 장황해진다.
 *
 * Pratt 파서는 각 토큰에 "결합력(binding power)" 숫자를 붙이고, 함수 하나로 끝낸다:
 *
 *   parseExpr(minBp):
 *     left = 전위 위치의 토큰 처리 (숫자, '(', 부호 …)          ← nud (null denotation)
 *     loop:
 *       op = 다음 토큰
 *       if op의 왼쪽 결합력 lbp(op) <= minBp: break               ← 약한 연산자는 호출자에게 양보
 *       left = op를 중위/후위로 처리하며 오른쪽을 parseExpr(rbp)로 읽음  ← led (left denotation)
 *     return left
 *
 * 예) 1 + 2 × 3
 *   parseExpr(0): left=1, '+'(lbp 10 > 0) → right = parseExpr(10)
 *       parseExpr(10): left=2, '×'(lbp 20 > 10) → 2×3 을 만들어 반환
 *   → 1 + (2×3)
 *   '×' 대신 '−'(lbp 10)였다면 10 <= 10 이므로 break → (1+2)−… 즉 왼쪽 결합이 된다.
 *
 * ── fx-991ES PLUS 우선순위 (높을수록 먼저) ────────────────────────────
 *   60  후위 함수     x², x⁻¹, x!, °'" …
 *   50  거듭제곱      ^, ˣ√                      (이후 단계)
 *   45  분수          a b/c                     (이후 단계)
 *   40  전위 부호     (-)          → -2² = -(2²) = -4
 *   35  nPr, nCr, ∠                            (이후 단계)
 *   30  생략된 곱셈   2π, 2(3), 3sin(x)   → ×÷보다 먼저! 6÷2(1+2) = 6÷6 = 1
 *   20  × ÷
 *   10  + −
 *
 * 생략된 곱셈이 ×÷보다 강한 것은 ES PLUS 시리즈의 특징이다 (신형 ClassWiz는 같은 순위라 9가 나온다).
 */
import { CalcError } from '../errors';
import type { Row } from '../input/editor';
import { TOKENS } from '../input/tokens';
import type { BinaryOp, Node, PostfixOp } from './ast';
import { tokenize, type Lex } from './tokenizer';

export const BP = {
  addSub: 10,
  mulDiv: 20,
  implicitMul: 30,
  prefixNeg: 40,
  postfix: 60,
} as const;

const BINARY_BP: Record<BinaryOp, number> = { '+': BP.addSub, '-': BP.addSub, '*': BP.mulDiv, '/': BP.mulDiv };

/** 재귀 깊이 제한. 실기의 Stack ERROR에 해당 (정확한 한계는 이후 단계에서 실기에 맞춘다). */
const MAX_DEPTH = 64;

export function parse(row: Row): Node {
  return new Parser(tokenize(row)).parseAll();
}

class Parser {
  private i = 0;
  private depth = 0;

  constructor(private readonly toks: Lex[]) {}

  parseAll(): Node {
    if (this.toks.length === 0) throw new CalcError('syntax', 0);
    const node = this.expr(0);
    const t = this.peek();
    if (t) throw new CalcError('syntax', t.pos); // 짝 없는 ')' 등 남은 토큰
    return node;
  }

  private peek(): Lex | undefined {
    return this.toks[this.i];
  }

  private endPos(): number {
    const last = this.toks[this.toks.length - 1];
    return last ? last.pos + 1 : 0;
  }

  private expr(minBp: number): Node {
    if (++this.depth > MAX_DEPTH) throw new CalcError('stack', this.peek()?.pos);
    let left = this.nud();

    for (;;) {
      const t = this.peek();
      if (!t) break;

      if (t.type === 'tok') {
        const def = TOKENS[t.id];
        if (def.kind === 'binop') {
          const op = t.id as BinaryOp;
          const bp = BINARY_BP[op];
          if (bp <= minBp) break;
          this.i++;
          // 오른쪽은 같은 결합력으로 읽는다 → 같은 순위가 연속되면 왼쪽부터 묶인다 (좌결합)
          left = { type: 'binary', op, left, right: this.expr(bp) };
          continue;
        }
        if (def.kind === 'postfix') {
          if (BP.postfix <= minBp) break;
          this.i++;
          left = { type: 'postfix', op: t.id as PostfixOp, operand: left };
          continue;
        }
        if (def.kind === 'rparen') break; // 괄호 닫기는 nud('(')가 처리
      }

      // 여기까지 왔다면 다음 토큰이 "값의 시작"인지 본다 → 생략된 곱셈
      if (this.startsImplicitOperand(t)) {
        if (BP.implicitMul <= minBp) break;
        left = { type: 'implicitMul', left, right: this.expr(BP.implicitMul) };
        continue;
      }
      throw new CalcError('syntax', t.pos);
    }

    this.depth--;
    return left;
  }

  /**
   * 값 바로 뒤에 와서 곱셈 기호를 생략할 수 있는 토큰인가?
   * '(', Ans (이후: 함수, 상수 π·e, 변수 A~F, √ 등).
   * 숫자 리터럴은 제외한다: "Ans2", "(1)2" 같은 입력은 곱으로 해석하지 않고 Syntax ERROR.
   * (실기 확인 필요 항목: 현재는 일반적인 Casio 동작을 따름)
   */
  private startsImplicitOperand(t: Lex): boolean {
    if (t.type !== 'tok') return false;
    const kind = TOKENS[t.id].kind;
    return kind === 'lparen' || kind === 'ans';
  }

  /** 전위 위치(값이 와야 하는 자리)의 토큰 처리 */
  private nud(): Node {
    const t = this.peek();
    if (!t) throw new CalcError('syntax', this.endPos());
    this.i++;

    if (t.type === 'num') return { type: 'num', mantissa: t.mantissa, exp10: t.exp10 };

    const kind = TOKENS[t.id].kind;
    switch (kind) {
      case 'ans':
        return { type: 'ans' };
      case 'neg':
        return { type: 'neg', operand: this.expr(BP.prefixNeg) };
      case 'binop':
        // 식 맨 앞이나 연산자 뒤의 '−'는 부호로 읽는다 (실기에서 "−3=" 은 -3).
        // '+'는 무시한다. ×, ÷ 는 값이 올 자리에 올 수 없으므로 오류.
        if (t.id === '-') return { type: 'neg', operand: this.expr(BP.prefixNeg) };
        if (t.id === '+') return this.expr(BP.prefixNeg);
        throw new CalcError('syntax', t.pos);
      case 'lparen': {
        const inner = this.expr(0);
        const close = this.peek();
        // 닫는 괄호는 생략 가능: 식 끝에 도달했으면 자동으로 닫힌 것으로 본다.
        if (close && close.type === 'tok' && TOKENS[close.id].kind === 'rparen') this.i++;
        return inner;
      }
      default:
        throw new CalcError('syntax', t.pos);
    }
  }
}
