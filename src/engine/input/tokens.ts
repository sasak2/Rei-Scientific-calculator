/**
 * 입력 버퍼에 들어가는 "토큰" 정의.
 *
 * 실기에서 키 하나는 화면 문자 하나(또는 `sin(` 같은 덩어리 하나)를 넣는다.
 * DEL로 지울 때도 이 단위로 지워지므로, 입력 버퍼는 문자열이 아니라 토큰 ID의 나열이다.
 * 파서는 토큰의 `kind`를 보고 문법적 역할을 판단한다.
 *
 * LineIO(한 줄 입력)에서는 분수·거듭제곱도 토큰으로 들어간다:
 *   분수 2⌟3,  대분수 1⌟2⌟3,  거듭제곱 2^(3),  거듭제곱근 3ˣ√(8)
 * MathIO(6단계)에서는 같은 기능을 틀(template)로 넣는다.
 */
export type TokenKind =
  | 'digit' // 0-9
  | 'point' // .
  | 'exp10' // ×10^x (지수 표기의 E)
  | 'binop' // + − × ÷ nPr nCr ⌟
  | 'neg' // (-) 부호
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'func' // sin( 처럼 여는 괄호를 포함한 함수
  | 'powop' // ^( ˣ√( : 중위 연산자이면서 오른쪽 피연산자를 괄호로 감싼다
  | 'postfix' // x², x⁻¹, x!, %, ° r g (DRG)
  | 'dms' // °'" (60진법 입력)
  | 'const' // π, e
  | 'var' // A~F, X, Y, M
  | 'ans'
  | 'ran'; // Ran#

export interface TokenDef {
  readonly kind: TokenKind;
  /** 선형 표시용 문자 */
  readonly text: string;
}

const t = (kind: TokenKind, text: string): TokenDef => ({ kind, text });

export const TOKENS = {
  '0': t('digit', '0'),
  '1': t('digit', '1'),
  '2': t('digit', '2'),
  '3': t('digit', '3'),
  '4': t('digit', '4'),
  '5': t('digit', '5'),
  '6': t('digit', '6'),
  '7': t('digit', '7'),
  '8': t('digit', '8'),
  '9': t('digit', '9'),
  '.': t('point', '.'),
  E: t('exp10', '×₁₀'),

  '+': t('binop', '+'),
  '-': t('binop', '−'),
  '*': t('binop', '×'),
  '/': t('binop', '÷'),
  P: t('binop', 'P'), // nPr
  C: t('binop', 'C'), // nCr
  '⌟': t('binop', '⌟'), // 분수

  neg: t('neg', '-'),
  '(': t('lparen', '('),
  ')': t('rparen', ')'),
  ',': t('comma', ','),

  'sin(': t('func', 'sin('),
  'cos(': t('func', 'cos('),
  'tan(': t('func', 'tan('),
  'asin(': t('func', 'sin⁻¹('),
  'acos(': t('func', 'cos⁻¹('),
  'atan(': t('func', 'tan⁻¹('),
  'sinh(': t('func', 'sinh('),
  'cosh(': t('func', 'cosh('),
  'tanh(': t('func', 'tanh('),
  'asinh(': t('func', 'sinh⁻¹('),
  'acosh(': t('func', 'cosh⁻¹('),
  'atanh(': t('func', 'tanh⁻¹('),
  'log(': t('func', 'log('),
  'ln(': t('func', 'ln('),
  '10^(': t('func', '10^('),
  'e^(': t('func', 'e^('),
  '√(': t('func', '√('),
  '∛(': t('func', '∛('),
  'Abs(': t('func', 'Abs('),
  'Pol(': t('func', 'Pol('),
  'Rec(': t('func', 'Rec('),
  'Rnd(': t('func', 'Rnd('),
  'RanInt#(': t('func', 'RanInt#('),

  '^(': t('powop', '^('),
  'ˣ√(': t('powop', 'ˣ√('),

  sq: t('postfix', '²'),
  cube: t('postfix', '³'),
  inv: t('postfix', '⁻¹'),
  '!': t('postfix', '!'),
  '%': t('postfix', '%'),
  drgDeg: t('postfix', 'º'), // DRG▶ 의 도(°) 표시. 60진법 °와 구분하려고 다른 글리프를 쓴다
  drgRad: t('postfix', 'ʳ'),
  drgGra: t('postfix', 'ᵍ'),

  '°': t('dms', '°'),

  π: t('const', 'π'),
  e: t('const', 'e'),

  A: t('var', 'A'),
  B: t('var', 'B'),
  Cv: t('var', 'C'), // 변수 C (nCr의 C와 구분)
  D: t('var', 'D'),
  Ev: t('var', 'E'), // 변수 E (지수 E와 구분)
  F: t('var', 'F'),
  X: t('var', 'X'),
  Y: t('var', 'Y'),
  M: t('var', 'M'),

  Ans: t('ans', 'Ans'),
  'Ran#': t('ran', 'Ran#'),
} as const satisfies Record<string, TokenDef>;

export type TokenId = keyof typeof TOKENS;

export const VARIABLES = ['A', 'B', 'Cv', 'D', 'Ev', 'F', 'X', 'Y', 'M'] as const;
export type VarName = (typeof VARIABLES)[number];

export function tokenDef(id: TokenId): TokenDef {
  return TOKENS[id];
}

/** 화면 표시용 변수 이름 (Cv → C) */
export function varLabel(v: VarName): string {
  return TOKENS[v].text;
}
