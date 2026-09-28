/**
 * 키패드 배치 데이터. 배치를 바꾸려면 이 파일만 고치면 된다.
 * 라벨은 fx-991ES PLUS 실기 기준 (shift = 키 위 왼쪽 주황 글씨, alpha = 오른쪽 글씨).
 * `key`는 엔진의 물리 키 ID, 'fold'는 UI 전용(공학 영역 접기).
 */
import type { PhysicalKey } from '../../engine/keys';

export type KeyClass = 'digit' | 'op' | 'fn' | 'ctrl' | 'eq' | 'clear';

export interface KeySpec {
  key: PhysicalKey | 'fold';
  label: string;
  shift?: string;
  alpha?: string;
  cls: KeyClass;
  /** 스크린리더용 이름 (라벨이 기호일 때) */
  aria?: string;
}

/** 항상 보이는 컨트롤 줄 */
export const CONTROL_ROW: KeySpec[] = [
  { key: 'shift', label: 'SHIFT', cls: 'ctrl' },
  { key: 'alpha', label: 'ALPHA', cls: 'ctrl' },
  { key: 'left', label: '◀', cls: 'ctrl', aria: '커서 왼쪽' },
  { key: 'right', label: '▶', cls: 'ctrl', aria: '커서 오른쪽' },
  { key: 'mode', label: 'MODE', shift: 'SETUP', cls: 'ctrl' },
  { key: 'fold', label: '⌄', cls: 'ctrl', aria: '공학 키 접기/펼치기' },
];

/** 접을 수 있는 공학 영역 (6열 × 4행) */
export const SCIENTIFIC_ROWS: KeySpec[][] = [
  [
    { key: 'calc', label: 'CALC', shift: 'SOLVE', alpha: '=', cls: 'fn' },
    { key: 'integral', label: '∫□', shift: 'd/dx', alpha: ':', cls: 'fn' },
    { key: 'inv', label: 'x⁻¹', shift: 'x!', cls: 'fn' },
    { key: 'logab', label: 'log□□', shift: 'Σ', cls: 'fn' },
    { key: 'up', label: '▲', cls: 'ctrl', aria: '위 (이전 계산)' },
    { key: 'down', label: '▼', cls: 'ctrl', aria: '아래 (다음 계산)' },
  ],
  [
    { key: 'frac', label: '□/□', shift: '□□/□', cls: 'fn' },
    { key: 'sqrt', label: '√□', shift: '∛□', cls: 'fn' },
    { key: 'sq', label: 'x²', shift: 'x³', cls: 'fn' },
    { key: 'pow', label: 'x□', shift: 'ˣ√□', cls: 'fn' },
    { key: 'log', label: 'log', shift: '10ˣ', cls: 'fn' },
    { key: 'ln', label: 'ln', shift: 'eˣ', cls: 'fn' },
  ],
  [
    { key: 'neg', label: '(−)', alpha: 'A', cls: 'fn', aria: '부호' },
    { key: 'dms', label: "°'\"", shift: '←', alpha: 'B', cls: 'fn' },
    { key: 'hyp', label: 'hyp', shift: 'Abs', alpha: 'C', cls: 'fn' },
    { key: 'sin', label: 'sin', shift: 'sin⁻¹', alpha: 'D', cls: 'fn' },
    { key: 'cos', label: 'cos', shift: 'cos⁻¹', alpha: 'E', cls: 'fn' },
    { key: 'tan', label: 'tan', shift: 'tan⁻¹', alpha: 'F', cls: 'fn' },
  ],
  [
    { key: 'rcl', label: 'RCL', shift: 'STO', cls: 'fn' },
    { key: 'eng', label: 'ENG', shift: '←', cls: 'fn' },
    { key: 'lparen', label: '(', shift: '%', cls: 'fn' },
    { key: 'rparen', label: ')', shift: ',', alpha: 'X', cls: 'fn' },
    { key: 'sd', label: 'S⇔D', shift: 'a b/c⇔d/c', alpha: 'Y', cls: 'fn' },
    { key: 'mplus', label: 'M+', shift: 'M−', alpha: 'M', cls: 'fn' },
  ],
];

/** 항상 보이는 기본 키패드 (5열 × 4행) */
export const BASIC_ROWS: KeySpec[][] = [
  [
    { key: 'd7', label: '7', shift: 'CONST', cls: 'digit' },
    { key: 'd8', label: '8', shift: 'CONV', cls: 'digit' },
    { key: 'd9', label: '9', shift: 'CLR', cls: 'digit' },
    { key: 'del', label: 'DEL', shift: 'INS', cls: 'clear' },
    { key: 'ac', label: 'AC', shift: 'OFF', cls: 'clear' },
  ],
  [
    { key: 'd4', label: '4', shift: 'MATRIX', cls: 'digit' },
    { key: 'd5', label: '5', shift: 'VECTOR', cls: 'digit' },
    { key: 'd6', label: '6', cls: 'digit' },
    { key: 'mul', label: '×', shift: 'nPr', cls: 'op' },
    { key: 'div', label: '÷', shift: 'nCr', cls: 'op' },
  ],
  [
    { key: 'd1', label: '1', shift: 'STAT', cls: 'digit' },
    { key: 'd2', label: '2', shift: 'CMPLX', cls: 'digit' },
    { key: 'd3', label: '3', shift: 'DISTR', cls: 'digit' },
    { key: 'add', label: '+', shift: 'Pol', cls: 'op' },
    { key: 'sub', label: '−', shift: 'Rec', cls: 'op' },
  ],
  [
    { key: 'd0', label: '0', shift: 'Rnd', cls: 'digit' },
    { key: 'dot', label: '.', shift: 'Ran#', alpha: 'RanInt', cls: 'digit' },
    { key: 'exp', label: '×10ˣ', shift: 'π', alpha: 'e', cls: 'digit' },
    { key: 'ans', label: 'Ans', shift: 'DRG▶', cls: 'fn' },
    { key: 'equals', label: '=', cls: 'eq' },
  ],
];

/** 데스크톱 키보드 → 물리 키 */
export const KEYBOARD_MAP: Record<string, PhysicalKey> = {
  '0': 'd0', '1': 'd1', '2': 'd2', '3': 'd3', '4': 'd4',
  '5': 'd5', '6': 'd6', '7': 'd7', '8': 'd8', '9': 'd9',
  '.': 'dot', '+': 'add', '-': 'sub', '*': 'mul', '/': 'div',
  '(': 'lparen', ')': 'rparen',
  Enter: 'equals', '=': 'equals',
  Backspace: 'del', Escape: 'ac', Delete: 'ac',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  e: 'exp', E: 'exp', a: 'ans', A: 'ans', n: 'neg',
};
