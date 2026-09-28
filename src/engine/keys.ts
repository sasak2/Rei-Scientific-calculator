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

export type Command = 'del' | 'ac' | 'equals' | 'left' | 'right' | 'up' | 'down' | 'shift' | 'alpha';

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

  inv: { main: tok('inv') },
  sq: { main: tok('sq') },
  neg: { main: tok('neg') },
  lparen: { main: tok('(') },
  rparen: { main: tok(')') },

  d0: { main: tok('0') },
  d1: { main: tok('1') },
  d2: { main: tok('2') },
  d3: { main: tok('3') },
  d4: { main: tok('4') },
  d5: { main: tok('5') },
  d6: { main: tok('6') },
  d7: { main: tok('7') },
  d8: { main: tok('8') },
  d9: { main: tok('9') },
  dot: { main: tok('.') },
  exp: { main: tok('E') },
  ans: { main: tok('Ans') },
  add: { main: tok('+') },
  sub: { main: tok('-') },
  mul: { main: tok('*') },
  div: { main: tok('/') },
  del: { main: cmd('del') },
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
