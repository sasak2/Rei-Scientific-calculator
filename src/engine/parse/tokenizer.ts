/**
 * 토크나이저: 편집기의 Row(토큰 ID 나열)를 파서가 읽을 어휘 토큰으로 바꾼다.
 *
 * 편집기 토큰은 "키 하나 = 토큰 하나"라서 숫자 12.5는 ['1','2','.','5'] 네 개다.
 * 여기서 이를 숫자 리터럴 하나로 묶는다. ×10^x(E)도 리터럴의 일부로 처리한다:
 *   2 E 3     → 2×10^3
 *   E 3       → 1×10^3   (가수 없이 누르면 1로 간주, 실기 동작)
 *   2 E (-) 3 → 2×10^-3  (지수에는 부호만 올 수 있다)
 *
 * 60진법(°'")도 여기서 리터럴로 묶는다:  2°30°15°  →  2 + 30/60 + 15/3600
 * 마지막 부분의 °는 생략할 수 있다(2°30 = 2.5).
 *
 * 틀(template)은 이후 단계에서 "자식 Row를 재귀 파싱한 원자 토큰"으로 변환한다.
 */
import { CalcError } from '../errors';
import type { Row } from '../input/editor';
import { TOKENS, type TokenId, type TokenKind } from '../input/tokens';

export type Lex =
  | { type: 'num'; mantissa: string; exp10: number; pos: number }
  | { type: 'dms'; parts: string[]; pos: number }
  | { type: 'tok'; id: TokenId; pos: number };

export function tokenize(row: Row): Lex[] {
  const out: Lex[] = [];
  let i = 0;

  const idAt = (k: number): TokenId | null => {
    const it = row[k];
    return it && it.t === 'tok' ? it.id : null;
  };
  const kindAt = (k: number): TokenKind | null => {
    const id = idAt(k);
    return id ? TOKENS[id].kind : null;
  };
  const isNumStart = (k: number) => kindAt(k) === 'digit' || kindAt(k) === 'point' || kindAt(k) === 'exp10';

  /** 숫자 리터럴 하나를 읽는다 (가수 + 선택적 지수) */
  const readNumber = (): { mantissa: string; exp10: number } => {
    const start = i;
    let mantissa = '';
    let points = 0;
    while (kindAt(i) === 'digit' || kindAt(i) === 'point') {
      if (kindAt(i) === 'point') points++;
      mantissa += idAt(i);
      i++;
    }
    if (points > 1 || mantissa === '.') throw new CalcError('syntax', start);
    if (mantissa === '') mantissa = '1';

    let exp10 = 0;
    if (kindAt(i) === 'exp10') {
      i++;
      let sign = 1;
      while (kindAt(i) === 'neg' || idAt(i) === '-' || idAt(i) === '+') {
        if (idAt(i) !== '+') sign = -sign;
        i++;
      }
      let digits = '';
      while (kindAt(i) === 'digit') digits += idAt(i++);
      if (digits === '') throw new CalcError('syntax', i);
      exp10 = sign * Number(digits);
    }
    // 리터럴 바로 뒤에 소수점/E가 또 오면 문법 오류 (예: 2E3.5, 2E3E4)
    if (kindAt(i) === 'point' || kindAt(i) === 'exp10') throw new CalcError('syntax', i);
    return { mantissa, exp10 };
  };

  while (i < row.length) {
    const item = row[i];
    if (item.t === 'tpl') throw new CalcError('syntax', i); // 틀은 MathIO(6단계)에서 평가

    if (isNumStart(i)) {
      const start = i;
      const first = readNumber();
      if (kindAt(i) !== 'dms') {
        out.push({ type: 'num', ...first, pos: start });
        continue;
      }
      // 60진법: 숫자° 숫자° 숫자°  (지수 표기는 쓸 수 없다)
      if (first.exp10 !== 0) throw new CalcError('syntax', i);
      const parts = [first.mantissa];
      i++; // 첫 °
      while (parts.length < 3 && (kindAt(i) === 'digit' || kindAt(i) === 'point')) {
        const p = readNumber();
        if (p.exp10 !== 0) throw new CalcError('syntax', i);
        parts.push(p.mantissa);
        if (kindAt(i) === 'dms') i++;
        else break;
      }
      if (kindAt(i) === 'dms') throw new CalcError('syntax', i); // °가 네 번 이상
      out.push({ type: 'dms', parts, pos: start });
      continue;
    }
    if (kindAt(i) === 'dms') throw new CalcError('syntax', i); // 숫자 없이 °
    out.push({ type: 'tok', id: item.id, pos: i });
    i++;
  }
  return out;
}
