/**
 * 추상 구문 트리(AST).
 * 파서의 출력이자 평가기의 입력. 판별 유니온(`type` 필드)으로 두어 switch에서
 * TypeScript가 빠진 경우를 잡아 주게 한다.
 */
export type BinaryOp = '+' | '-' | '*' | '/';
export type PostfixOp = 'sq' | 'inv';

export type Node =
  | { type: 'num'; mantissa: string; exp10: number }
  | { type: 'ans' }
  | { type: 'neg'; operand: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  /** 곱셈 기호를 생략한 곱. ×와 결과는 같지만 우선순위가 달라서 별도 노드로 남긴다 */
  | { type: 'implicitMul'; left: Node; right: Node }
  | { type: 'postfix'; op: PostfixOp; operand: Node };
