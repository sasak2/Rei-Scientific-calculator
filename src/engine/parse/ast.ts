/**
 * 추상 구문 트리(AST).
 * 파서의 출력이자 평가기의 입력. 판별 유니온(`type` 필드)으로 두어 switch에서
 * TypeScript가 빠진 경우를 잡아 주게 한다.
 */
import type { VarName } from '../input/tokens';

export type BinaryOp = '+' | '-' | '*' | '/' | 'P' | 'C' | '^' | 'root';
export type PostfixOp = 'sq' | 'cube' | 'inv' | '!' | '%' | 'drgDeg' | 'drgRad' | 'drgGra';
export type FuncName =
  | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'
  | 'sinh' | 'cosh' | 'tanh' | 'asinh' | 'acosh' | 'atanh'
  | 'log' | 'ln' | 'pow10' | 'exp' | 'sqrt' | 'cbrt' | 'abs'
  | 'pol' | 'rec' | 'rnd' | 'ranint';

export type Node =
  | { type: 'num'; mantissa: string; exp10: number }
  /** 60진법 리터럴: 도°분°초° */
  | { type: 'dms'; parts: string[] }
  | { type: 'const'; name: 'π' | 'e' }
  | { type: 'var'; name: VarName }
  | { type: 'ans' }
  | { type: 'ran' }
  | { type: 'neg'; operand: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  /** 곱셈 기호를 생략한 곱. ×와 결과는 같지만 우선순위가 달라서 별도 노드로 남긴다 */
  | { type: 'implicitMul'; left: Node; right: Node }
  | { type: 'postfix'; op: PostfixOp; operand: Node }
  /** 분수 a⌟b, 대분수 w⌟a⌟b */
  | { type: 'frac'; whole?: Node; num: Node; den: Node }
  | { type: 'call'; fn: FuncName; args: Node[] };
