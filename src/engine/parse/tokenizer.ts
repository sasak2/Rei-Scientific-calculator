/**
 * 토크나이저: 편집기의 Row(토큰 ID 나열)를 파서가 읽을 어휘 토큰으로 바꾼다.
 *
 * 편집기 토큰은 "키 하나 = 토큰 하나"라서 숫자 12.5는 ['1','2','.','5'] 네 개다.
 * 여기서 이를 숫자 리터럴 하나로 묶는다. ×10^x(E)도 리터럴의 일부로 처리한다:
 *   2 E 3     → 2×10^3
 *   E 3       → 1×10^3   (가수 없이 누르면 1로 간주, 실기 동작)
 *   2 E (-) 3 → 2×10^-3  (지수에는 (-)만 올 수 있다)
 *
 * 틀(template)은 이후 단계에서 "자식 Row를 재귀 파싱한 원자 토큰"으로 변환한다.
 */
import { CalcError } from '../errors';
import type { Row } from '../input/editor';
import { TOKENS, type TokenId } from '../input/tokens';

export type Lex =
  | { type: 'num'; mantissa: string; exp10: number; pos: number }
  | { type: 'tok'; id: TokenId; pos: number };

export function tokenize(row: Row): Lex[] {
  const out: Lex[] = [];
  let i = 0;

  const idAt = (k: number): TokenId | null => {
    const it = row[k];
    return it && it.t === 'tok' ? it.id : null;
  };
  const kindAt = (k: number) => {
    const id = idAt(k);
    return id ? TOKENS[id].kind : null;
  };

  while (i < row.length) {
    const item = row[i];
    if (item.t !== 'tpl' && (kindAt(i) === 'digit' || kindAt(i) === 'point' || kindAt(i) === 'exp10')) {
      const start = i;
      // 가수부: 숫자와 소수점 (소수점은 최대 1개)
      let mantissa = '';
      let points = 0;
      while (kindAt(i) === 'digit' || kindAt(i) === 'point') {
        if (kindAt(i) === 'point') points++;
        mantissa += idAt(i);
        i++;
      }
      if (points > 1) throw new CalcError('syntax', start);
      if (mantissa === '.') throw new CalcError('syntax', start);
      if (mantissa === '') mantissa = '1';

      // 지수부
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
      out.push({ type: 'num', mantissa, exp10, pos: start });
      continue;
    }
    if (item.t === 'tpl') throw new CalcError('syntax', i); // MVP: 틀은 아직 평가하지 않음
    out.push({ type: 'tok', id: item.id, pos: i });
    i++;
  }
  return out;
}
