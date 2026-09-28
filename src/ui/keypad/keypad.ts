import { isImplemented, type PhysicalKey } from '../../engine/keys';
import { BASIC_ROWS, CONTROL_ROW, SCIENTIFIC_ROWS, type KeySpec } from './layout';

export interface KeypadOptions {
  onKey(key: PhysicalKey): void;
  onFoldChange(folded: boolean): void;
}

/**
 * 키패드: layout.ts의 데이터를 DOM으로 그린다.
 * pointerdown에서 바로 반응한다 (click은 모바일에서 ~100ms 늦고, 연타 시 더블탭 확대가 끼어든다).
 */
export class Keypad {
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly sciSection: HTMLElement;
  private folded = false;
  private readonly pulseTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: KeypadOptions,
  ) {
    root.append(this.grid([CONTROL_ROW], 'keys-control'));
    this.sciSection = this.grid(SCIENTIFIC_ROWS, 'keys-sci');
    root.append(this.sciSection, this.grid(BASIC_ROWS, 'keys-basic'));
  }

  private grid(rows: KeySpec[][], cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `keys ${cls}`;
    el.style.setProperty('--cols', String(rows[0].length));
    for (const row of rows) for (const spec of row) el.append(this.button(spec));
    return el;
  }

  private button(spec: KeySpec): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `key key-${spec.cls}`;
    b.dataset.key = spec.key;
    if (spec.aria) b.setAttribute('aria-label', spec.aria);

    if (spec.shift || spec.alpha) {
      const top = document.createElement('span');
      top.className = 'key-sub';
      top.innerHTML = `<span class="lbl-shift">${spec.shift ?? ''}</span><span class="lbl-alpha">${spec.alpha ?? ''}</span>`;
      b.append(top);
    }
    const main = document.createElement('span');
    main.className = 'key-main';
    main.textContent = spec.label;
    b.append(main);

    if (spec.key !== 'fold' && !isImplemented(spec.key)) b.classList.add('key-todo');

    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // 포커스 이동과 텍스트 선택 방지
      this.trigger(spec.key);
    });
    // 키보드 포커스 사용자(Tab + Enter/Space)를 위한 경로
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.trigger(spec.key);
      }
    });
    this.buttons.set(spec.key, b);
    return b;
  }

  private trigger(key: PhysicalKey | 'fold'): void {
    if (key === 'fold') {
      this.setFolded(!this.folded);
      this.opts.onFoldChange(this.folded);
      return;
    }
    this.flash(key);
    this.opts.onKey(key);
  }

  /** 누른 키에 파형 펄스 이펙트 (키보드 입력에도 호출) */
  flash(key: PhysicalKey): void {
    const b = this.buttons.get(key);
    if (!b) return;
    b.classList.remove('pulse');
    void b.offsetWidth; // 애니메이션 재시작을 위한 리플로우
    b.classList.add('pulse');
    // animationend 대신 타이머: 애니메이션을 끈 환경(prefers-reduced-motion)에서도 확실히 풀린다
    clearTimeout(this.pulseTimers.get(key));
    this.pulseTimers.set(key, setTimeout(() => b.classList.remove('pulse'), 380));
  }

  setFolded(folded: boolean): void {
    this.folded = folded;
    this.sciSection.hidden = folded;
    this.root.classList.toggle('folded', folded);
    const fold = this.buttons.get('fold');
    if (fold) fold.querySelector('.key-main')!.textContent = folded ? '⌃' : '⌄';
  }

  /** SHIFT/ALPHA가 켜지면 해당 레이어 라벨을 강조 */
  setLayer(shift: boolean, alpha: boolean): void {
    this.root.classList.toggle('layer-shift', shift);
    this.root.classList.toggle('layer-alpha', alpha);
    this.buttons.get('shift')?.classList.toggle('on', shift);
    this.buttons.get('alpha')?.classList.toggle('on', alpha);
  }

  labelOf(key: PhysicalKey, layer: 'main' | 'shift' | 'alpha'): string {
    const all = [CONTROL_ROW, ...SCIENTIFIC_ROWS, ...BASIC_ROWS].flat();
    const spec = all.find((s) => s.key === key);
    if (!spec) return key;
    return (layer === 'main' ? spec.label : spec[layer]) ?? spec.label;
  }
}
