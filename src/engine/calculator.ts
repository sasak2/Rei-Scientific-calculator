/**
 * Calculator: 키 입력을 받아 상태를 바꾸고 이벤트를 내보내는 상태 기계.
 *
 * 화면 상태는 세 가지다.
 *   editing : 식을 입력하는 중
 *   result  : = 를 눌러 결과를 보여 주는 중 (식은 위 줄에 남아 있음)
 *   error   : 오류 메시지 표시 중. AC로 지우거나 ◀▶로 오류 위치로 돌아간다
 *
 * result 상태에서의 실기 동작:
 *   - 숫자/괄호/부호 등 "값의 시작"  → 새 식을 시작
 *   - + − × ÷ x² x⁻¹ 등 "앞에 값이 필요한 키" → Ans를 자동으로 붙이고 이어서 입력
 *   - ◀ / ▶ → 직전 식을 다시 편집 (◀는 끝에, ▶는 처음에 커서)
 *   - = → 같은 식을 다시 계산 (식에 Ans가 있으면 반복 계산이 된다)
 */
import { CalcError, ERROR_LABEL, type ErrorKind } from './errors';
import { evaluate, type AngleUnit } from './eval/evaluate';
import { formatNorm, formattedToText, type FormattedNumber } from './format/display';
import {
  cloneRow,
  cursorToEnd,
  cursorToStart,
  deleteBackward,
  emptyEditor,
  insertToken,
  isEmpty,
  moveLeft,
  moveRight,
  type EditorState,
  type Row,
} from './input/editor';
import { TOKENS, type TokenId, type TokenKind } from './input/tokens';
import { resolveKey, type Action, type Layer, type PhysicalKey } from './keys';
import { parse } from './parse/parser';
import { ZERO, type Value } from './value/value';

export type KeyCategory = 'digit' | 'operator' | 'function' | 'control' | 'equals' | 'clear';

export type CalcEvent =
  | { type: 'input'; key: PhysicalKey; category: KeyCategory; token?: TokenId }
  | { type: 'result'; value: Value; formatted: FormattedNumber; text: string }
  | { type: 'error'; kind: ErrorKind }
  | { type: 'clear' }
  | { type: 'modifier'; shift: boolean; alpha: boolean }
  | { type: 'unimplemented'; key: PhysicalKey; layer: Layer };

export type Screen = 'editing' | 'result' | 'error';

export interface Setup {
  angle: AngleUnit;
  io: 'line' | 'math';
  norm: 1 | 2;
}

interface HistoryEntry {
  row: Row;
  result: Value;
}

const HISTORY_MAX = 30;

/** result 상태에서 이 종류의 토큰이 오면 Ans를 앞에 붙인다 */
const NEEDS_LEFT_OPERAND: ReadonlySet<TokenKind> = new Set(['binop', 'postfix']);

export class Calculator {
  editor: EditorState = emptyEditor();
  screen: Screen = 'editing';
  shift = false;
  alpha = false;
  ans: Value = ZERO;
  result: { value: Value; formatted: FormattedNumber } | null = null;
  error: { kind: ErrorKind; pos?: number } | null = null;
  setup: Setup = { angle: 'deg', io: 'line', norm: 1 };

  private history: HistoryEntry[] = [];
  /** ▲▼ 탐색 중인 히스토리 위치 (-1 = 탐색 안 함) */
  private historyIdx = -1;

  press(key: PhysicalKey): CalcEvent[] {
    const layer: Layer = this.shift ? 'shift' : this.alpha ? 'alpha' : 'main';
    const action = resolveKey(key, layer);
    const events: CalcEvent[] = [];

    const isModifier = action?.kind === 'cmd' && (action.cmd === 'shift' || action.cmd === 'alpha');
    if (!isModifier && (this.shift || this.alpha)) {
      // SHIFT/ALPHA는 다음 키 하나에만 적용되고 풀린다
      this.shift = this.alpha = false;
      events.push({ type: 'modifier', shift: false, alpha: false });
    }

    if (!action) {
      events.push({ type: 'unimplemented', key, layer });
      return events;
    }
    this.apply(key, action, events);
    return events;
  }

  // ------------------------------------------------------------ 동작

  private apply(key: PhysicalKey, action: Action, events: CalcEvent[]): void {
    if (action.kind === 'token') {
      if (this.screen === 'error') return; // 오류 중에는 AC, ◀, ▶ 만 받는다
      this.inputToken(action.id);
      events.push({ type: 'input', key, category: categoryOfToken(action.id), token: action.id });
      return;
    }

    switch (action.cmd) {
      case 'shift':
        this.shift = !this.shift;
        this.alpha = false;
        events.push({ type: 'modifier', shift: this.shift, alpha: this.alpha });
        return;
      case 'alpha':
        this.alpha = !this.alpha;
        this.shift = false;
        events.push({ type: 'modifier', shift: this.shift, alpha: this.alpha });
        return;
      case 'ac':
        this.editor = emptyEditor();
        this.screen = 'editing';
        this.result = null;
        this.error = null;
        this.historyIdx = -1;
        events.push({ type: 'clear' });
        return;
      case 'del':
        if (this.screen === 'error') return;
        if (this.screen === 'result') this.backToEdit('end');
        else deleteBackward(this.editor);
        events.push({ type: 'input', key, category: 'control' });
        return;
      case 'left':
      case 'right':
        if (this.screen === 'error') {
          this.backToEdit(this.error?.pos);
        } else if (this.screen === 'result') {
          this.backToEdit(action.cmd === 'left' ? 'end' : 'start');
        } else if (action.cmd === 'left') {
          moveLeft(this.editor);
        } else {
          moveRight(this.editor);
        }
        events.push({ type: 'input', key, category: 'control' });
        return;
      case 'up':
      case 'down':
        this.browseHistory(action.cmd === 'up' ? 1 : -1);
        events.push({ type: 'input', key, category: 'control' });
        return;
      case 'equals':
        this.calculate(events);
        return;
    }
  }

  private inputToken(id: TokenId): void {
    if (this.screen === 'result') {
      this.editor = emptyEditor();
      this.screen = 'editing';
      this.result = null;
      if (NEEDS_LEFT_OPERAND.has(TOKENS[id].kind)) insertToken(this.editor, 'Ans');
    }
    this.historyIdx = -1;
    insertToken(this.editor, id);
  }

  private calculate(events: CalcEvent[]): void {
    if (this.screen === 'error') return;
    if (isEmpty(this.editor)) return; // 빈 식에서 = 는 아무 일도 하지 않는다
    try {
      const ast = parse(this.editor.root);
      const value = evaluate(ast, { ans: this.ans, angle: this.setup.angle });
      const formatted = formatNorm(value, this.setup.norm);
      this.ans = value;
      this.result = { value, formatted };
      this.screen = 'result';
      this.pushHistory({ row: cloneRow(this.editor.root), result: value });
      events.push({ type: 'result', value, formatted, text: formattedToText(formatted) });
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = { kind: e.kind, pos: e.pos };
      this.screen = 'error';
      events.push({ type: 'error', kind: e.kind });
    }
  }

  private backToEdit(where: 'start' | 'end' | number | undefined): void {
    this.screen = 'editing';
    this.result = null;
    this.error = null;
    if (where === 'start') cursorToStart(this.editor);
    else if (typeof where === 'number') this.editor.cursor = { path: [], index: Math.min(where, this.editor.root.length) };
    else cursorToEnd(this.editor);
  }

  private pushHistory(entry: HistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.historyIdx = -1;
  }

  /** ▲(+1)은 더 이전 계산으로, ▼(-1)은 최근 쪽으로. 식과 그 결과를 함께 불러온다. */
  private browseHistory(dir: 1 | -1): void {
    if (this.history.length === 0) return;
    let idx = this.historyIdx === -1 ? (dir === 1 ? 0 : -1) : this.historyIdx + dir;
    // 결과 표시 중 첫 ▲는 방금 계산(=맨 마지막)을 건너뛰고 그 이전으로 간다
    if (this.historyIdx === -1 && dir === 1 && this.screen === 'result') idx = 1;
    if (idx < 0 || idx >= this.history.length) return;
    const entry = this.history[this.history.length - 1 - idx];
    this.historyIdx = idx;
    this.editor = { root: cloneRow(entry.row), cursor: { path: [], index: entry.row.length } };
    this.result = { value: entry.result, formatted: formatNorm(entry.result, this.setup.norm) };
    this.error = null;
    this.screen = 'result';
  }

  get errorLabel(): string | null {
    return this.error ? ERROR_LABEL[this.error.kind] : null;
  }
}

export function categoryOfToken(id: TokenId): KeyCategory {
  switch (TOKENS[id].kind) {
    case 'digit':
    case 'point':
    case 'exp10':
      return 'digit';
    case 'binop':
    case 'neg':
      return 'operator';
    default:
      return 'function';
  }
}
