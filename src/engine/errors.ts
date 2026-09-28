/**
 * fx-991ES PLUS의 오류 종류.
 * - math:     수학적으로 정의되지 않음 (0으로 나누기, 범위 초과 ±10^100 등)
 * - syntax:   식의 형태가 잘못됨 (2++, 짝이 맞지 않는 닫는 괄호 등)
 * - stack:    중첩이 너무 깊음 (실기는 수치 스택 10단, 명령 스택 24단)
 * - argument: 함수 인수가 잘못됨 (이후 단계에서 사용)
 */
export type ErrorKind = 'math' | 'syntax' | 'stack' | 'argument';

export const ERROR_LABEL: Record<ErrorKind, string> = {
  math: 'Math ERROR',
  syntax: 'Syntax ERROR',
  stack: 'Stack ERROR',
  argument: 'Argument ERROR',
};

export class CalcError extends Error {
  constructor(
    readonly kind: ErrorKind,
    /** 오류가 난 위치(루트 Row 기준 인덱스). 실기처럼 ◀▶로 돌아갔을 때 커서를 둘 곳 */
    readonly pos?: number,
  ) {
    super(ERROR_LABEL[kind]);
  }
}
