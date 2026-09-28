import type { Calculator } from '../../engine/calculator';
import type { DisplayForm, FormattedNumber } from '../../engine/format/display';
import { CURSOR, linearCells } from '../../engine/input/editor';
import { MENUS } from '../../engine/menus';

/**
 * LCD 디스플레이: 상태 표시줄 / 수식 줄 / 결과 줄. 메뉴가 열리면 수식·결과 자리에 메뉴를 그린다.
 * 엔진 상태를 받아 통째로 다시 그린다 (DOM 요소가 수십 개 수준이라 diff가 필요 없다).
 */
export class Display {
  private readonly ind: Record<string, HTMLElement> = {};
  private readonly expr: HTMLElement;
  private readonly result: HTMLElement;
  private readonly menu: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="lcd-status" aria-hidden="true">
        <span data-ind="S" class="ind-shift">S</span>
        <span data-ind="A" class="ind-alpha">A</span>
        <span data-ind="M">M</span>
        <span data-ind="STO">STO</span>
        <span data-ind="RCL">RCL</span>
        <span data-ind="mode">COMP</span>
        <span data-ind="angle" class="lit">D</span>
        <span data-ind="fmt">FIX</span>
        <span data-ind="io" class="lit">Line</span>
        <span class="spacer"></span>
        <span data-ind="up">▲</span>
        <span data-ind="down">▼</span>
      </div>
      <div class="lcd-body">
        <div class="lcd-expr" aria-live="off"></div>
        <div class="lcd-result" aria-live="polite"></div>
        <div class="lcd-menu" hidden></div>
      </div>`;
    root.querySelectorAll<HTMLElement>('[data-ind]').forEach((el) => (this.ind[el.dataset.ind!] = el));
    this.expr = root.querySelector('.lcd-expr')!;
    this.result = root.querySelector('.lcd-result')!;
    this.menu = root.querySelector('.lcd-menu')!;
  }

  render(calc: Calculator): void {
    this.renderStatus(calc);

    const menuOpen = !!calc.menu;
    this.menu.hidden = !menuOpen;
    this.expr.hidden = menuOpen;
    this.result.hidden = menuOpen;
    if (menuOpen) return this.renderMenu(calc);

    if (calc.screen === 'message') {
      this.expr.textContent = calc.message;
      this.result.className = 'lcd-result is-note';
      this.result.textContent = '[AC]';
      return;
    }

    this.renderExpr(calc);

    if (calc.screen === 'error') {
      this.result.className = 'lcd-result is-error';
      this.result.textContent = calc.errorLabel;
    } else if (calc.screen === 'result' && calc.result) {
      this.result.className = 'lcd-result';
      this.result.replaceChildren(renderForm(calc.result.form));
    } else {
      this.result.className = 'lcd-result is-empty';
      this.result.replaceChildren();
    }
  }

  private renderStatus(calc: Calculator): void {
    const lit = (k: string, on: boolean) => this.ind[k].classList.toggle('lit', on);
    lit('S', calc.shift);
    lit('A', calc.alpha);
    lit('M', calc.memoryIndicator);
    lit('STO', calc.pending === 'sto');
    lit('RCL', calc.pending === 'rcl');
    lit('mode', false); // COMP 모드는 표시가 없다 (CMPLX 등은 3단계)
    this.ind.angle.textContent = { deg: 'D', rad: 'R', gra: 'G' }[calc.setup.angle];
    const fmt = calc.setup.format;
    this.ind.fmt.textContent = fmt.mode === 'fix' ? 'FIX' : fmt.mode === 'sci' ? 'SCI' : 'FIX';
    lit('fmt', fmt.mode !== 'norm');
    this.ind.io.textContent = calc.setup.io === 'math' ? 'Math' : 'Line';
    lit('up', calc.screen === 'result' && calc.canGoUp);
    lit('down', false);
  }

  private renderMenu(calc: Calculator): void {
    const m = calc.menu!;
    const def = MENUS[m.id];
    const items = def.pages[m.page];
    const title =
      m.id === 'clrConfirm'
        ? ({ setup: 'Reset Setup?', memory: 'Clear Memory?', all: 'Reset All?' }[m.arg ?? ''] ?? '')
        : def.prompt && m.id !== 'clr'
          ? def.prompt
          : '';
    const html = [
      title ? `<div class="menu-title">${title}</div>` : '',
      items.length ? `<div class="menu-grid">${items.map((it) => `<span>${it}</span>`).join('')}</div>` : '',
      def.pages.length > 1 ? `<div class="menu-page">${m.page < def.pages.length - 1 ? '▼' : '▲'}</div>` : '',
    ].join('');
    this.menu.innerHTML = html;
    this.menu.className = `lcd-menu menu-${m.id}`;
  }

  private renderExpr(calc: Calculator): void {
    const note = calc.exprNote;
    if (note?.replace) {
      this.expr.textContent = note.text; // RCL: "A="
      return;
    }
    // 결과/오류 표시 중에는 커서를 숨긴다 (실기와 동일)
    const cells = linearCells(calc.editor, calc.screen === 'editing');
    const frag = document.createDocumentFragment();
    let text = '';
    const flush = () => {
      if (text) frag.append(text);
      text = '';
    };
    let cursorEl: HTMLElement | null = null;
    for (const c of cells) {
      if (c === CURSOR) {
        flush();
        cursorEl = document.createElement('span');
        cursorEl.className = calc.overwrite ? 'lcd-cursor is-overwrite' : 'lcd-cursor';
        frag.append(cursorEl);
      } else {
        text += c;
      }
    }
    if (note) text += note.text; // "→A", "M+"
    flush();
    this.expr.replaceChildren(frag);

    // 긴 식은 가로로 스크롤해서 커서가 보이게 한다
    if (cursorEl) {
      const left = cursorEl.offsetLeft;
      const { scrollLeft, clientWidth } = this.expr;
      if (left < scrollLeft + 8) this.expr.scrollLeft = left - 8;
      else if (left > scrollLeft + clientWidth - 16) this.expr.scrollLeft = left - clientWidth + 16;
    } else {
      this.expr.scrollLeft = 0;
    }
  }
}

// ------------------------------------------------------------------ 결과 그리기

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 7세그먼트 숫자. 뒤에 꺼진 세그먼트("8")를 옅게 깔아 LCD 느낌을 낸다.
 * DSEG7 폰트에서 '.'은 폭이 없는 글리프라 숫자 사이에 겹쳐 그려진다.
 */
function seg(text: string, cls = 'seg'): HTMLElement {
  const s = el('span', cls);
  s.append(el('span', 'seg-ghost', text.replace(/[0-9-]/g, '8')), el('span', 'seg-lit', text));
  return s;
}

/** 7세그먼트로 그릴 수 없는 기호 (°, ×10, r= …) */
const sym = (text: string) => el('span', 'sym', text);
/** 분수 기호 ⌟ : 폰트에 글리프가 없는 경우가 많아 CSS 테두리로 그린다 */
const fracMark = () => {
  const m = el('span', 'sym-frac');
  m.setAttribute('aria-label', '분의');
  return m;
};

function renderNumber(f: FormattedNumber, wrap = el('span', 'num')): HTMLElement {
  wrap.append(seg((f.neg ? '-' : '') + f.mantissa));
  if (f.exponent !== null) {
    wrap.append(sym('×10'), seg(String(f.exponent), 'seg seg-exp'));
  }
  return wrap;
}

function renderForm(form: DisplayForm): HTMLElement {
  const wrap = el('span', 'num');
  switch (form.kind) {
    case 'num':
      renderNumber(form.num, wrap);
      break;
    case 'frac':
      if (form.whole) wrap.append(seg((form.neg ? '-' : '') + form.whole), fracMark(), seg(form.num));
      else wrap.append(seg((form.neg ? '-' : '') + form.num));
      wrap.append(fracMark(), seg(form.den));
      break;
    case 'dms':
      wrap.append(seg((form.neg ? '-' : '') + form.d), sym('°'), seg(form.m), sym('°'), seg(form.s), sym('°'));
      break;
    case 'pair':
      wrap.classList.add('is-pair');
      for (const it of form.items) {
        const item = el('span', 'pair-item');
        item.append(sym(`${it.label}=`));
        renderNumber(it.num, item);
        wrap.append(item);
      }
      break;
  }
  return wrap;
}
