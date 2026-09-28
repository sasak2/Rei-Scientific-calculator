import type { Calculator } from '../../engine/calculator';
import type { FormattedNumber } from '../../engine/format/display';
import { CURSOR, linearCells } from '../../engine/input/editor';

/**
 * LCD 디스플레이: 상태 표시줄 / 수식 줄 / 결과 줄.
 * 엔진 상태를 받아 통째로 다시 그린다 (DOM 요소가 수십 개 수준이라 diff가 필요 없다).
 */
export class Display {
  private readonly ind: Record<string, HTMLElement> = {};
  private readonly expr: HTMLElement;
  private readonly result: HTMLElement;

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
        <span data-ind="io" class="lit">Line</span>
        <span class="spacer"></span>
        <span data-ind="up">▲</span>
        <span data-ind="down">▼</span>
      </div>
      <div class="lcd-expr" aria-live="off"></div>
      <div class="lcd-result" aria-live="polite"></div>`;
    root.querySelectorAll<HTMLElement>('[data-ind]').forEach((el) => (this.ind[el.dataset.ind!] = el));
    this.expr = root.querySelector('.lcd-expr')!;
    this.result = root.querySelector('.lcd-result')!;
  }

  render(calc: Calculator): void {
    this.ind.S.classList.toggle('lit', calc.shift);
    this.ind.A.classList.toggle('lit', calc.alpha);
    this.ind.mode.classList.toggle('lit', false);
    this.ind.angle.textContent = { deg: 'D', rad: 'R', gra: 'G' }[calc.setup.angle];
    this.ind.io.textContent = calc.setup.io === 'math' ? 'Math' : 'Line';

    this.renderExpr(calc);

    if (calc.screen === 'error') {
      this.result.className = 'lcd-result is-error';
      this.result.textContent = calc.errorLabel;
    } else if (calc.screen === 'result' && calc.result) {
      this.result.className = 'lcd-result';
      this.result.replaceChildren(renderNumber(calc.result.formatted));
    } else {
      this.result.className = 'lcd-result is-empty';
      this.result.replaceChildren();
    }
  }

  private renderExpr(calc: Calculator): void {
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
        cursorEl.className = 'lcd-cursor';
        frag.append(cursorEl);
      } else {
        text += c;
      }
    }
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

/**
 * 결과 숫자: 가수는 7세그먼트 폰트, 지수는 "×10" + 작은 위첨자.
 * 7세그먼트 뒤에 꺼진 세그먼트("8")를 옅게 깔아 LCD 느낌을 낸다.
 */
function renderNumber(f: FormattedNumber): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'num';
  const mant = (f.neg ? '-' : '') + f.mantissa;

  const seg = document.createElement('span');
  seg.className = 'seg';
  const ghost = document.createElement('span');
  ghost.className = 'seg-ghost';
  ghost.textContent = mant.replace(/[0-9-]/g, '8');
  const lit = document.createElement('span');
  lit.className = 'seg-lit';
  lit.textContent = mant;
  seg.append(ghost, lit);
  wrap.append(seg);

  if (f.exponent !== null) {
    const x10 = document.createElement('span');
    x10.className = 'x10';
    x10.textContent = '×10';
    const sup = document.createElement('sup');
    sup.className = 'seg-exp';
    sup.textContent = String(f.exponent);
    wrap.append(x10, sup);
  }
  wrap.setAttribute('aria-label', mant + (f.exponent !== null ? ` 곱하기 10의 ${f.exponent}제곱` : ''));
  return wrap;
}
