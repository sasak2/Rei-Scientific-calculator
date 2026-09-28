import { Calculator } from '../calculator';
import type { PhysicalKey } from '../keys';

/** 테스트용 약식 키 표기: ~ = (-),  ² = x²,  ⁻ = x⁻¹,  A = Ans,  E = ×10^x */
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

export function keysOf(s: string): PhysicalKey[] {
  return [...s].map((c) => (c >= '0' && c <= '9' ? (`d${c}` as PhysicalKey) : (CHAR_KEY[c] ?? fail(c))));
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
  const f = calc.result!.formatted;
  return `${f.neg ? '-' : ''}${f.mantissa}${f.exponent !== null ? `e${f.exponent}` : ''}`;
}
