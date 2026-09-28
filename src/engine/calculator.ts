/**
 * Calculator: 키 입력을 받아 상태를 바꾸고 이벤트를 내보내는 상태 기계.
 *
 * 화면 상태
 *   editing : 식을 입력하는 중
 *   result  : = 를 눌러 결과를 보여 주는 중 (식은 위 줄에 남아 있음)
 *   error   : 오류 메시지 표시 중. AC로 지우거나 ◀▶로 오류 위치로 돌아간다
 *   message : "Clear Memory" 같은 알림. AC로 닫는다
 * 그 위에 메뉴(MODE, SETUP, hyp …)가 열릴 수 있고, STO/RCL은 다음 키(변수)를 기다리는 대기 상태다.
 *
 * result 상태에서의 실기 동작:
 *   - 숫자/괄호/부호 등 "값의 시작"  → 새 식을 시작
 *   - + − × ÷ x² ^ 등 "앞에 값이 필요한 키" → Ans를 자동으로 붙이고 이어서 입력
 *   - ◀ / ▶ → 직전 식을 다시 편집 (◀는 끝에, ▶는 처음에 커서)
 *   - = → 같은 식을 다시 계산 (식에 Ans가 있으면 반복 계산이 된다)
 *   - S⇔D, ENG, °'" → 같은 값을 다른 형식으로 다시 보여 준다
 */
import { CalcError, ERROR_LABEL, type ErrorKind } from './errors';
import { evaluate, evaluatePair, type AngleUnit, type EvalContext } from './eval/evaluate';
import {
  engExponent,
  formatDMS,
  formatEng,
  formatFraction,
  formatNumber,
  formToText,
  type DisplayForm,
  type NumberFormat,
} from './format/display';
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
import { TOKENS, VARIABLES, varLabel, type TokenId, type TokenKind, type VarName } from './input/tokens';
import { digitOf, resolveKey, type Action, type Command, type Layer, type PhysicalKey } from './keys';
import { MENUS, type MenuId, type MenuState } from './menus';
import { parse } from './parse/parser';
import { add, fromDecimal, neg, sub, ZERO, type Value } from './value/value';

export type KeyCategory = 'digit' | 'operator' | 'function' | 'control' | 'equals' | 'clear';

export type CalcEvent =
  | { type: 'input'; key: PhysicalKey; category: KeyCategory; token?: TokenId }
  | { type: 'result'; value: Value; form: DisplayForm; text: string }
  /** S⇔D, ENG 등으로 같은 결과의 표시 형식만 바뀜 */
  | { type: 'view'; form: DisplayForm; text: string }
  | { type: 'error'; kind: ErrorKind }
  | { type: 'clear' }
  | { type: 'modifier'; shift: boolean; alpha: boolean }
  | { type: 'menu'; id: MenuId | null }
  | { type: 'memory'; op: 'sto' | 'rcl' | 'm+' | 'm-'; variable: VarName; value: Value }
  | { type: 'setup' }
  | { type: 'message'; text: string }
  | { type: 'unimplemented'; key: PhysicalKey; layer: Layer; label?: string };

export type Screen = 'editing' | 'result' | 'error' | 'message';

export interface Setup {
  angle: AngleUnit;
  io: 'line' | 'math';
  format: NumberFormat;
  /** 분수 결과 형식: 대분수(ab/c) 또는 가분수(d/c). 실기 기본값은 d/c */
  mixedFraction: boolean;
}

export const DEFAULT_SETUP: Setup = { angle: 'deg', io: 'line', format: { mode: 'norm', n: 1 }, mixedFraction: false };

type View = 'auto' | 'dec' | 'frac' | 'dms' | 'eng';

export interface ResultState {
  value: Value;
  /** Pol/Rec처럼 결과가 두 개인 경우 */
  pair: [Value, Value] | null;
  pairLabels?: [string, string];
  /** 식에 분수(⌟)가 들어 있었으면 결과도 분수로 보인다 (LineIO 규칙) */
  fracInput: boolean;
  view: View;
  /** SHIFT S⇔D로 대분수/가분수를 바꾼 상태 */
  mixedToggled: boolean;
  engExp: number;
  form: DisplayForm;
  /** RCL 결과처럼 Ans가 아닌 다른 토큰으로 이어서 계산해야 할 때 */
  continueWith?: TokenId;
}

interface HistoryEntry {
  row: Row;
  result: Value;
  fracInput: boolean;
}

const HISTORY_MAX = 30;

/** result 상태에서 이 종류의 토큰이 오면 Ans를 앞에 붙인다 */
const NEEDS_LEFT_OPERAND: ReadonlySet<TokenKind> = new Set(['binop', 'postfix', 'powop']);

const zeroVars = () => Object.fromEntries(VARIABLES.map((v) => [v, ZERO])) as Record<VarName, Value>;

export class Calculator {
  editor: EditorState = emptyEditor();
  screen: Screen = 'editing';
  shift = false;
  alpha = false;
  /** SHIFT DEL (INS): 덮어쓰기 모드 */
  overwrite = false;
  ans: Value = ZERO;
  vars: Record<VarName, Value> = zeroVars();
  result: ResultState | null = null;
  error: { kind: ErrorKind; pos?: number } | null = null;
  message: string | null = null;
  menu: MenuState | null = null;
  /** STO / RCL 다음 키(변수) 대기 */
  pending: 'sto' | 'rcl' | null = null;
  /** 결과 줄 위(식 줄)에 덧붙여 보여 줄 표시: "→A", "M+" 또는 식 대신 "A=" */
  exprNote: { text: string; replace: boolean } | null = null;
  setup: Setup = structuredClone(DEFAULT_SETUP);

  private history: HistoryEntry[] = [];
  /** ▲▼ 탐색 중인 히스토리 위치 (-1 = 탐색 안 함) */
  private historyIdx = -1;

  constructor(private readonly random: () => number = Math.random) {}

  press(key: PhysicalKey): CalcEvent[] {
    const layer: Layer = this.shift ? 'shift' : this.alpha ? 'alpha' : 'main';
    const events: CalcEvent[] = [];

    // 메뉴가 열려 있으면 SHIFT/ALPHA 레이어와 관계없이 메뉴가 키를 먼저 받는다
    if (this.menu) {
      this.clearModifiers(events);
      this.menuKey(key, events);
      return events;
    }

    // STO/RCL 대기: 다음 키를 ALPHA 레이어로 해석해 변수를 얻는다
    if (this.pending) {
      const op = this.pending;
      this.pending = null;
      this.clearModifiers(events);
      const a = resolveKey(key, 'alpha');
      if (a?.kind === 'token' && TOKENS[a.id].kind === 'var') this.memory(op, a.id as VarName, events);
      else events.push({ type: 'input', key, category: 'control' }); // 취소
      return events;
    }

    const action = resolveKey(key, layer);
    const isModifier = action?.kind === 'cmd' && (action.cmd === 'shift' || action.cmd === 'alpha');
    if (!isModifier) this.clearModifiers(events);

    if (!action) {
      events.push({ type: 'unimplemented', key, layer });
      return events;
    }
    this.apply(key, action, events);
    return events;
  }

  /** SHIFT/ALPHA는 다음 키 하나에만 적용되고 풀린다 */
  private clearModifiers(events: CalcEvent[]): void {
    if (this.shift || this.alpha) {
      this.shift = this.alpha = false;
      events.push({ type: 'modifier', shift: false, alpha: false });
    }
  }

  // ------------------------------------------------------------ 동작

  private apply(key: PhysicalKey, action: Action, events: CalcEvent[]): void {
    if (this.screen === 'message') {
      if (action.kind === 'cmd' && action.cmd === 'ac') this.acClear(events);
      return;
    }
    if (action.kind === 'token') {
      if (this.screen === 'error') return; // 오류 중에는 AC, ◀, ▶ 만 받는다
      // 결과 표시 중 °'" 는 입력이 아니라 60진법 표시 전환
      if (action.id === '°' && this.screen === 'result') return this.setView('dms', events);
      this.inputToken(action.id);
      events.push({ type: 'input', key, category: categoryOfToken(action.id), token: action.id });
      return;
    }
    this.command(key, action.cmd, events);
  }

  private command(key: PhysicalKey, c: Command, events: CalcEvent[]): void {
    const control = (): void => {
      events.push({ type: 'input', key, category: 'control' });
    };
    switch (c) {
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
        return this.acClear(events);
      case 'del':
        if (this.screen === 'error') return;
        if (this.screen === 'result') this.backToEdit('end');
        else deleteBackward(this.editor);
        return control();
      case 'ins':
        this.overwrite = !this.overwrite;
        return control();
      case 'left':
      case 'right':
        if (this.screen === 'error') this.backToEdit(this.error?.pos);
        else if (this.screen === 'result') this.backToEdit(c === 'left' ? 'end' : 'start');
        else if (c === 'left') moveLeft(this.editor);
        else moveRight(this.editor);
        return control();
      case 'up':
      case 'down':
        if (this.screen === 'error') return;
        this.browseHistory(c === 'up' ? 1 : -1);
        return control();
      case 'equals':
        return this.calculate(events);
      case 'mode':
      case 'setup':
      case 'hyp':
      case 'drg':
      case 'clr':
        if (this.screen === 'error') return;
        return this.openMenu(c === 'setup' ? 'setup' : c, events);
      case 'sto':
      case 'rcl':
        if (this.screen === 'error') return;
        this.pending = c;
        return control();
      case 'mplus':
      case 'mminus':
        if (this.screen === 'error') return;
        return this.memory(c === 'mplus' ? 'm+' : 'm-', 'M', events);
      case 'sd':
        return this.toggleSD(events);
      case 'abcd':
        if (this.result?.form.kind === 'frac') {
          this.result.mixedToggled = !this.result.mixedToggled;
          this.refreshResult(events);
        }
        return;
      case 'eng':
      case 'engLeft':
        return this.eng(c === 'eng' ? -3 : 3, events);
      case 'dmsBack':
        if (this.screen === 'result') this.setView('dec', events);
        return;
    }
  }

  private acClear(events: CalcEvent[]): void {
    this.editor = emptyEditor();
    this.screen = 'editing';
    this.result = null;
    this.error = null;
    this.message = null;
    this.exprNote = null;
    this.pending = null;
    this.historyIdx = -1;
    events.push({ type: 'clear' });
  }

  private inputToken(id: TokenId): void {
    if (this.screen === 'result') {
      const cont = this.result?.continueWith ?? 'Ans';
      this.editor = emptyEditor();
      this.screen = 'editing';
      this.result = null;
      this.exprNote = null;
      if (NEEDS_LEFT_OPERAND.has(TOKENS[id].kind)) insertToken(this.editor, cont);
    }
    this.historyIdx = -1;
    if (this.overwrite) {
      // 덮어쓰기: 커서 위치의 토큰을 지우고 넣는다 (루트 칸에서만)
      const row = this.editor.root;
      const i = this.editor.cursor.index;
      if (this.editor.cursor.path.length === 0 && i < row.length) row.splice(i, 1);
    }
    insertToken(this.editor, id);
  }

  // ------------------------------------------------------------ 계산

  private context(): EvalContext {
    return {
      ans: this.ans,
      angle: this.setup.angle,
      vars: this.vars,
      rnd: (v) => this.roundToDisplay(v),
      random: this.random,
    };
  }

  /** Rnd( : 현재 표시 형식으로 보이는 값 그대로 반올림 */
  private roundToDisplay(v: Value): Value {
    const f = formatNumber(v, this.setup.format);
    const m = (f.neg ? '-' : '') + f.mantissa;
    const r = fromDecimal(m.replace('-', ''), f.exponent ?? 0);
    return f.neg ? neg(r) : r;
  }

  /** 현재 식을 계산한다. 성공하면 값, 실패하면 오류 상태로 바꾸고 null */
  private evalCurrent(events: CalcEvent[]): { value: Value; pair: [Value, Value] | null } | null {
    try {
      const ast = parse(this.editor.root);
      const ctx = this.context();
      const pair = evaluatePair(ast, ctx);
      const value = pair ? pair[0] : evaluate(ast, ctx);
      return { value, pair };
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      this.error = { kind: e.kind, pos: e.pos };
      this.screen = 'error';
      this.result = null;
      events.push({ type: 'error', kind: e.kind });
      return null;
    }
  }

  private calculate(events: CalcEvent[]): void {
    if (this.screen === 'error') return;
    if (isEmpty(this.editor)) return; // 빈 식에서 = 는 아무 일도 하지 않는다
    this.exprNote = null;
    const r = this.evalCurrent(events);
    if (!r) return;
    if (r.pair) {
      // Pol → r, θ / Rec → x, y  를 X, Y에 저장 (실기 동작)
      this.vars.X = r.pair[0];
      this.vars.Y = r.pair[1];
    }
    const isPol = r.pair && this.editor.root[0]?.t === 'tok' && this.editor.root[0].id === 'Pol(';
    this.showResult(r.value, events, {
      pair: r.pair,
      pairLabels: r.pair ? (isPol ? ['r', 'θ'] : ['X', 'Y']) : undefined,
    });
    this.pushHistory({ row: cloneRow(this.editor.root), result: r.value, fracInput: this.hasFractionInput() });
  }

  private hasFractionInput(): boolean {
    return this.editor.root.some((it) => it.t === 'tok' && it.id === '⌟');
  }

  private showResult(
    value: Value,
    events: CalcEvent[],
    opts: { pair?: [Value, Value] | null; pairLabels?: [string, string]; updateAns?: boolean; continueWith?: TokenId } = {},
  ): void {
    if (opts.updateAns !== false) this.ans = value;
    this.result = {
      value,
      pair: opts.pair ?? null,
      pairLabels: opts.pairLabels,
      fracInput: this.hasFractionInput(),
      view: 'auto',
      mixedToggled: false,
      engExp: 0,
      form: { kind: 'num', num: { neg: false, mantissa: '0', exponent: null } },
      continueWith: opts.continueWith,
    };
    this.result.form = this.renderForm(this.result);
    this.screen = 'result';
    this.error = null;
    events.push({ type: 'result', value, form: this.result.form, text: formToText(this.result.form) });
  }

  /** 결과 상태로부터 실제 표시 형식을 결정 */
  private renderForm(r: ResultState): DisplayForm {
    const fmt = this.setup.format;
    if (r.pair) {
      const [la, lb] = r.pairLabels ?? ['X', 'Y'];
      return {
        kind: 'pair',
        items: [
          { label: la, num: formatNumber(r.pair[0], fmt) },
          { label: lb, num: formatNumber(r.pair[1], fmt) },
        ],
      };
    }
    const mixed = this.setup.mixedFraction !== r.mixedToggled;
    switch (r.view) {
      case 'dms':
        return formatDMS(r.value) ?? { kind: 'num', num: formatNumber(r.value, fmt) };
      case 'eng':
        return { kind: 'num', num: formatEng(r.value, r.engExp) };
      case 'frac':
        return formatFraction(r.value, mixed) ?? { kind: 'num', num: formatNumber(r.value, fmt) };
      case 'auto':
        if (r.fracInput) {
          const f = formatFraction(r.value, mixed);
          if (f) return f;
        }
        return { kind: 'num', num: formatNumber(r.value, fmt) };
      case 'dec':
        return { kind: 'num', num: formatNumber(r.value, fmt) };
    }
  }

  private refreshResult(events: CalcEvent[]): void {
    if (!this.result) return;
    this.result.form = this.renderForm(this.result);
    events.push({ type: 'view', form: this.result.form, text: formToText(this.result.form) });
  }

  private setView(view: View, events: CalcEvent[]): void {
    if (this.screen !== 'result' || !this.result || this.result.pair) return;
    this.result.view = view;
    this.refreshResult(events);
  }

  /** S⇔D: 분수 ⇔ 소수. 분수로 나타낼 수 없는 값이면 그대로 */
  private toggleSD(events: CalcEvent[]): void {
    if (this.screen !== 'result' || !this.result || this.result.pair) return;
    const showingFrac = this.result.form.kind === 'frac';
    if (showingFrac) return this.setView('dec', events);
    const mixed = this.setup.mixedFraction !== this.result.mixedToggled;
    if (formatFraction(this.result.value, mixed)) this.setView('frac', events);
  }

  /**
   * ENG: 지수를 3의 배수로. 처음 누르면 표준 ENG 표기(가수 1~999),
   * 다시 누르면 ENG는 지수를 3 줄이고(가수가 커짐), SHIFT ENG(←)는 3 늘린다.
   */
  private eng(delta: -3 | 3, events: CalcEvent[]): void {
    if (this.screen !== 'result' || !this.result || this.result.pair) return;
    const r = this.result;
    if (r.view !== 'eng') {
      r.engExp = engExponent(r.value) + (delta > 0 ? 3 : 0);
      r.view = 'eng';
    } else {
      r.engExp += delta;
    }
    // 가수가 10자리를 넘거나 지수가 범위를 벗어나면 더 이동하지 않는다
    if (Math.abs(r.engExp) > 99) r.engExp -= delta;
    this.refreshResult(events);
  }

  // ------------------------------------------------------------ 메모리 (STO, RCL, M+, M−)

  private memory(op: 'sto' | 'rcl' | 'm+' | 'm-', variable: VarName, events: CalcEvent[]): void {
    const label = varLabel(variable);
    if (op === 'rcl') {
      const value = this.vars[variable];
      this.exprNote = { text: `${label}=`, replace: true };
      this.showResult(value, events, { updateAns: false, continueWith: variable });
      events.push({ type: 'memory', op, variable, value });
      return;
    }

    // 계산할 값: 입력 중인 식이 있으면 그 식, 없으면(또는 결과 표시 중이면) Ans
    let value: Value;
    const usingExpr = this.screen === 'editing' && !isEmpty(this.editor);
    if (usingExpr) {
      const r = this.evalCurrent(events);
      if (!r) return;
      value = r.value;
    } else {
      value = this.ans;
      this.editor = emptyEditor();
      insertToken(this.editor, 'Ans'); // 실기 표시: "Ans→A", "Ans M+"
      this.screen = 'editing';
    }

    if (op === 'sto') this.vars[variable] = value;
    else this.vars.M = op === 'm+' ? add(this.vars.M, value) : sub(this.vars.M, value);

    this.exprNote = { text: op === 'sto' ? `→${label}` : op === 'm+' ? 'M+' : 'M−', replace: false };
    this.showResult(value, events);
    events.push({ type: 'memory', op, variable, value: op === 'sto' ? value : this.vars.M });
  }

  // ------------------------------------------------------------ 메뉴

  private openMenu(id: MenuId, events: CalcEvent[], arg?: string): void {
    this.menu = { id, page: 0, arg };
    events.push({ type: 'menu', id });
  }

  private closeMenu(events: CalcEvent[]): void {
    this.menu = null;
    events.push({ type: 'menu', id: null });
  }

  private menuKey(key: PhysicalKey, events: CalcEvent[]): void {
    const menu = this.menu!;
    const def = MENUS[menu.id];
    if (key === 'ac') return this.closeMenu(events);
    if (key === 'down' && menu.page < def.pages.length - 1) {
      menu.page++;
      events.push({ type: 'menu', id: menu.id });
      return;
    }
    if (key === 'up' && menu.page > 0) {
      menu.page--;
      events.push({ type: 'menu', id: menu.id });
      return;
    }
    if (menu.id === 'clrConfirm') {
      if (key === 'equals') this.clearTarget(menu.arg!, events);
      return;
    }
    const n = digitOf(key);
    if (n === null) return;
    this.menuSelect(menu, n, key, events);
  }

  private unimplementedItem(key: PhysicalKey, label: string, events: CalcEvent[]): void {
    events.push({ type: 'unimplemented', key, layer: 'main', label });
  }

  private menuSelect(menu: MenuState, n: number, key: PhysicalKey, events: CalcEvent[]): void {
    const setupChanged = () => {
      this.closeMenu(events);
      if (this.result) this.result.form = this.renderForm(this.result);
      events.push({ type: 'setup' });
    };
    const insert = (id: TokenId) => {
      this.closeMenu(events);
      if (this.screen === 'error') return;
      this.inputToken(id);
      events.push({ type: 'input', key, category: 'function', token: id });
    };
    const itemLabel = MENUS[menu.id].pages[menu.page][n - 1]?.replace(/^\d:/, '') ?? '';

    switch (menu.id) {
      case 'mode':
        if (n === 1) {
          this.closeMenu(events);
          return this.acClear(events);
        }
        if (n >= 2 && n <= 8) this.unimplementedItem(key, itemLabel, events);
        return;

      case 'setup':
        if (menu.page === 0) {
          if (n === 1) return this.unimplementedItem(key, 'MthIO (6단계)', events);
          if (n === 2) {
            this.setup.io = 'line';
            return setupChanged();
          }
          if (n >= 3 && n <= 5) {
            this.setup.angle = (['deg', 'rad', 'gra'] as const)[n - 3];
            return setupChanged();
          }
          if (n === 6) return this.openMenu('fix', events);
          if (n === 7) return this.openMenu('sci', events);
          if (n === 8) return this.openMenu('norm', events);
        } else {
          if (n === 1 || n === 2) {
            this.setup.mixedFraction = n === 1;
            return setupChanged();
          }
          if (n >= 3 && n <= 5) return this.unimplementedItem(key, itemLabel, events);
          if (n === 6) return this.closeMenu(events); // 명암(CONT)은 웹에서 의미가 없다
        }
        return;

      case 'fix':
        this.setup.format = { mode: 'fix', n };
        return setupChanged();
      case 'sci':
        this.setup.format = { mode: 'sci', n: n === 0 ? 10 : n };
        return setupChanged();
      case 'norm':
        if (n === 1 || n === 2) {
          this.setup.format = { mode: 'norm', n };
          return setupChanged();
        }
        return;

      case 'hyp': {
        const ids: TokenId[] = ['sinh(', 'cosh(', 'tanh(', 'asinh(', 'acosh(', 'atanh('];
        if (n >= 1 && n <= 6) insert(ids[n - 1]);
        return;
      }
      case 'drg': {
        const ids: TokenId[] = ['drgDeg', 'drgRad', 'drgGra'];
        if (n >= 1 && n <= 3) insert(ids[n - 1]);
        return;
      }
      case 'clr':
        if (n >= 1 && n <= 3) {
          const target = ['setup', 'memory', 'all'][n - 1];
          this.openMenu('clrConfirm', events, target);
        }
        return;
      case 'clrConfirm':
        return;
    }
  }

  private clearTarget(target: string, events: CalcEvent[]): void {
    this.closeMenu(events);
    if (target === 'setup' || target === 'all') this.setup = structuredClone(DEFAULT_SETUP);
    if (target === 'memory' || target === 'all') {
      this.vars = zeroVars();
      this.ans = ZERO;
    }
    if (target === 'all') this.history = [];
    this.editor = emptyEditor();
    this.result = null;
    this.error = null;
    this.exprNote = null;
    this.message = { setup: 'Reset Setup', memory: 'Clear Memory', all: 'Reset All' }[target] ?? '';
    this.screen = 'message';
    events.push({ type: 'message', text: this.message });
    events.push({ type: 'setup' });
  }

  // ------------------------------------------------------------ 편집 복귀 · 히스토리

  private backToEdit(where: 'start' | 'end' | number | undefined): void {
    this.screen = 'editing';
    this.result = null;
    this.error = null;
    this.exprNote = null;
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
    this.exprNote = null;
    this.result = {
      value: entry.result,
      pair: null,
      fracInput: entry.fracInput,
      view: 'auto',
      mixedToggled: false,
      engExp: 0,
      form: { kind: 'num', num: { neg: false, mantissa: '0', exponent: null } },
    };
    this.result.form = this.renderForm(this.result);
    this.error = null;
    this.screen = 'result';
  }

  // ------------------------------------------------------------ 조회용

  get errorLabel(): string | null {
    return this.error ? ERROR_LABEL[this.error.kind] : null;
  }

  /** 상태 표시줄의 M: 메모리 M이 0이 아닐 때 켜진다 */
  get memoryIndicator(): boolean {
    const m = this.vars.M;
    return m.k === 'rat' ? m.n !== 0n : m.x !== 0;
  }

  get canGoUp(): boolean {
    return this.history.length > 0;
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
    case 'powop':
      return 'operator';
    default:
      return 'function';
  }
}
