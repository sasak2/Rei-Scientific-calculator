/**
 * 입력 버퍼에 들어가는 "토큰" 정의.
 *
 * 실기에서 키 하나는 화면 문자 하나(또는 `sin(` 같은 덩어리 하나)를 넣는다.
 * DEL로 지울 때도 이 단위로 지워지므로, 입력 버퍼는 문자열이 아니라 토큰 ID의 나열이다.
 * 파서는 토큰의 `kind`를 보고 문법적 역할을 판단한다.
 */
export type TokenKind =
  | 'digit' // 0-9
  | 'point' // .
  | 'exp10' // ×10^x (지수 표기의 E)
  | 'binop' // + − × ÷
  | 'neg' // (-) 부호
  | 'lparen'
  | 'rparen'
  | 'postfix' // x², x⁻¹ …
  | 'ans'; // Ans (이후 변수·상수도 같은 "값" 토큰 계열)

export interface TokenDef {
  readonly kind: TokenKind;
  /** 선형 표시용 문자 */
  readonly text: string;
}

export const TOKENS = {
  '0': { kind: 'digit', text: '0' },
  '1': { kind: 'digit', text: '1' },
  '2': { kind: 'digit', text: '2' },
  '3': { kind: 'digit', text: '3' },
  '4': { kind: 'digit', text: '4' },
  '5': { kind: 'digit', text: '5' },
  '6': { kind: 'digit', text: '6' },
  '7': { kind: 'digit', text: '7' },
  '8': { kind: 'digit', text: '8' },
  '9': { kind: 'digit', text: '9' },
  '.': { kind: 'point', text: '.' },
  E: { kind: 'exp10', text: '×₁₀' },
  '+': { kind: 'binop', text: '+' },
  '-': { kind: 'binop', text: '−' },
  '*': { kind: 'binop', text: '×' },
  '/': { kind: 'binop', text: '÷' },
  neg: { kind: 'neg', text: '-' },
  '(': { kind: 'lparen', text: '(' },
  ')': { kind: 'rparen', text: ')' },
  sq: { kind: 'postfix', text: '²' },
  inv: { kind: 'postfix', text: '⁻¹' },
  Ans: { kind: 'ans', text: 'Ans' },
} as const satisfies Record<string, TokenDef>;

export type TokenId = keyof typeof TOKENS;

export function tokenDef(id: TokenId): TokenDef {
  return TOKENS[id];
}
