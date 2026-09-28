import { Calculator } from '../calculator';
import { formToText } from '../format/display';
import type { PhysicalKey } from '../keys';

/**
 * 테스트용 약식 키 표기: ~ = (-),  ² = x²,  ⁻ = x⁻¹,  A = Ans,  E = ×10^x
 * 대괄호는 물리 키 이름: [sin], [S] = SHIFT, [A] = ALPHA  (예: "[S][sin]0.5)" = sin⁻¹(0.5))
 */
const CHAR_KEY: Record<string, PhysicalKey> = {
  '.': 'dot',
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '(': 'lparen',
  ')': 'rparen',
  '~': 'neg',
  E: 'exp',
  '²': 'sq',
  '⁻': 'inv',
  A: 'ans',
  '=': 'equals',
};

const ALIAS: Record<string, PhysicalKey> = { S: 'shift', A: 'alpha' };

export function keysOf(s: string): PhysicalKey[] {
  const out: PhysicalKey[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '[') {
      const end = s.indexOf(']', i);
      const name = s.slice(i + 1, end);
      out.push(ALIAS[name] ?? (name as PhysicalKey));
      i = end;
    } else {
      out.push(c >= '0' && c <= '9' ? (`d${c}` as PhysicalKey) : (CHAR_KEY[c] ?? fail(c)));
    }
  }
  return out;
}

function fail(c: string): never {
  throw new Error(`unknown test key: ${c}`);
}

export function type(calc: Calculator, s: string) {
  return keysOf(s).flatMap((k) => calc.press(k));
}

/** 식을 입력하고 = 를 눌러 표시 문자열(또는 오류 라벨)을 돌려준다. 지수는 e로 표기 */
export function run(expr: string, calc = new Calculator()): string {
  type(calc, expr + '=');
  if (calc.screen === 'error') return calc.errorLabel!;
  return shown(calc);
}

/** 결과 줄 표시를 문자열로. 숫자는 지수를 e로 줄여 쓴다 (1.5e10) */
export function shown(calc: Calculator): string {
  const form = calc.result!.form;
  if (form.kind !== 'num') return formToText(form);
  const f = form.num;
  return `${f.neg ? '-' : ''}${f.mantissa}${f.exponent !== null ? `e${f.exponent}` : ''}`;
}
