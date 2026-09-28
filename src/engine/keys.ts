/**
 * 물리 키 → 동작 매핑.
 *
 * UI는 "어떤 물리 키가 눌렸는지"만 엔진에 알린다. SHIFT/ALPHA 상태는 엔진이 가지고 있고,
 * 여기서 (물리 키, 레이어) → 동작을 결정한다. 실기의 `SHIFT MODE = SETUP` 같은 조합을
 * 한 곳에서 재현하기 위함이다. 매핑이 없는 조합은 'unimplemented' 이벤트가 된다.
 */
import type { TokenId } from './input/tokens';

export type PhysicalKey =
  // 컨트롤 줄
  | 'shift' | 'alpha' | 'left' | 'right' | 'up' | 'down' | 'mode'
  // 공학 영역
  | 'calc' | 'integral' | 'inv' | 'logab'
  | 'frac' | 'sqrt' | 'sq' | 'pow' | 'log' | 'ln'
  | 'neg' | 'dms' | 'hyp' | 'sin' | 'cos' | 'tan'
  | 'rcl' | 'eng' | 'lparen' | 'rparen' | 'sd' | 'mplus'
  // 기본 키패드
  | 'd0' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8' | 'd9'
  | 'dot' | 'exp' | 'ans' | 'del' | 'ac' | 'add' | 'sub' | 'mul' | 'div' | 'equals';

export type Command =
  | 'del' | 'ins' | 'ac' | 'equals'
  | 'left' | 'right' | 'up' | 'down'
  | 'shift' | 'alpha' | 'mode' | 'setup'
  | 'sto' | 'rcl' | 'mplus' | 'mminus'
  | 'sd' | 'abcd' | 'eng' | 'engLeft' | 'dmsBack'
  | 'hyp' | 'drg' | 'clr';

export type Action = { kind: 'token'; id: TokenId } | { kind: 'cmd'; cmd: Command };

export type Layer = 'main' | 'shift' | 'alpha';

type KeyMap = Partial<Record<PhysicalKey, Partial<Record<Layer, Action>>>>;

const tok = (id: TokenId): Action => ({ kind: 'token', id });
const cmd = (c: Command): Action => ({ kind: 'cmd', cmd: c });

export const KEYMAP: KeyMap = {
  shift: { main: cmd('shift'), shift: cmd('shift'), alpha: cmd('shift') },
  alpha: { main: cmd('alpha'), shift: cmd('alpha'), alpha: cmd('alpha') },
  left: { main: cmd('left') },
  right: { main: cmd('right') },
  up: { main: cmd('up') },
  down: { main: cmd('down') },
  mode: { main: cmd('mode'), shift: cmd('setup') },

  inv: { main: tok('inv'), shift: tok('!') },
  logab: { main: tok('log(') }, // LineIO에서 log□□ 는 log( 를 넣고 쉼표로 밑을 구분: log(2,8)

  frac: { main: tok('⌟'), shift: tok('⌟') }, // LineIO에서는 대분수도 같은 구분 기호: 1⌟2⌟3
  sqrt: { main: tok('√('), shift: tok('∛(') },
  sq: { main: tok('sq'), shift: tok('cube') },
  pow: { main: tok('^('), shift: tok('ˣ√(') },
  log: { main: tok('log('), shift: tok('10^(') },
  ln: { main: tok('ln('), shift: tok('e^(') },

  neg: { main: tok('neg'), alpha: tok('A') },
  dms: { main: tok('°'), shift: cmd('dmsBack'), alpha: tok('B') },
  hyp: { main: cmd('hyp'), shift: tok('Abs('), alpha: tok('Cv') },
  sin: { main: tok('sin('), shift: tok('asin('), alpha: tok('D') },
  cos: { main: tok('cos('), shift: tok('acos('), alpha: tok('Ev') },
  tan: { main: tok('tan('), shift: tok('atan('), alpha: tok('F') },

  rcl: { main: cmd('rcl'), shift: cmd('sto') },
  eng: { main: cmd('eng'), shift: cmd('engLeft') },
  lparen: { main: tok('('), shift: tok('%') },
  rparen: { main: tok(')'), shift: tok(','), alpha: tok('X') },
  sd: { main: cmd('sd'), shift: cmd('abcd'), alpha: tok('Y') },
  mplus: { main: cmd('mplus'), shift: cmd('mminus'), alpha: tok('M') },

  d0: { main: tok('0'), shift: tok('Rnd(') },
  d1: { main: tok('1') },
  d2: { main: tok('2') },
  d3: { main: tok('3') },
  d4: { main: tok('4') },
  d5: { main: tok('5') },
  d6: { main: tok('6') },
  d7: { main: tok('7') },
  d8: { main: tok('8') },
  d9: { main: tok('9'), shift: cmd('clr') },
  dot: { main: tok('.'), shift: tok('Ran#'), alpha: tok('RanInt#(') },
  exp: { main: tok('E'), shift: tok('π'), alpha: tok('e') },
  ans: { main: tok('Ans'), shift: cmd('drg') },
  add: { main: tok('+'), shift: tok('Pol(') },
  sub: { main: tok('-'), shift: tok('Rec(') },
  mul: { main: tok('*'), shift: tok('P') },
  div: { main: tok('/'), shift: tok('C') },
  del: { main: cmd('del'), shift: cmd('ins') },
  ac: { main: cmd('ac') },
  equals: { main: cmd('equals') },
};

export function resolveKey(key: PhysicalKey, layer: Layer): Action | null {
  return KEYMAP[key]?.[layer] ?? null;
}

/** UI가 "아직 구현 안 된 키"를 흐리게 표시할 때 사용 */
export function isImplemented(key: PhysicalKey, layer: Layer = 'main'): boolean {
  return resolveKey(key, layer) !== null;
}

/** 메뉴에서 숫자 키 → 번호 */
export function digitOf(key: PhysicalKey): number | null {
  return /^d\d$/.test(key) ? Number(key[1]) : null;
}
