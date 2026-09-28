import { describe, expect, it } from 'vitest';
import { Calculator } from '../calculator';
import { linearCells } from '../input/editor';
import { run, shown, type } from './helpers';

const text = (c: Calculator) => linearCells(c.editor, false).join('');

describe('Ans 이어가기', () => {
  it('결과 뒤 연산자는 Ans를 앞에 붙인다', () => {
    const c = new Calculator();
    type(c, '2+3=');
    type(c, '*2');
    expect(text(c)).toBe('Ans×2');
    expect(run('', c)).toBe('10');
  });

  it('결과 뒤 x²도 Ans를 붙인다', () => {
    const c = new Calculator();
    type(c, '3=');
    expect(run('²', c)).toBe('9');
  });

  it('결과 뒤 숫자는 새 식을 시작한다', () => {
    const c = new Calculator();
    type(c, '2+3=');
    expect(run('7', c)).toBe('7');
  });

  it('= 반복은 같은 식을 Ans로 다시 계산한다', () => {
    const c = new Calculator();
    type(c, '1=');
    type(c, 'A+1=');
    expect(run('', c)).toBe('3');
  });

  it('숫자 뒤 Ans는 곱셈 생략', () => {
    const c = new Calculator();
    type(c, '5=');
    expect(run('2A', c)).toBe('10');
  });
});

describe('편집', () => {
  it('DEL은 커서 왼쪽을 지운다', () => {
    const c = new Calculator();
    type(c, '123');
    c.press('del');
    expect(text(c)).toBe('12');
  });

  it('◀ 후 입력하면 중간에 끼워 넣는다', () => {
    const c = new Calculator();
    type(c, '13');
    c.press('left');
    type(c, '2');
    expect(text(c)).toBe('123');
  });

  it('▶는 끝에서 맨 앞으로 순환한다', () => {
    const c = new Calculator();
    type(c, '12');
    c.press('right');
    type(c, '9');
    expect(text(c)).toBe('912');
  });

  it('AC는 식을 지우고 Ans는 유지한다', () => {
    const c = new Calculator();
    type(c, '4=');
    c.press('ac');
    expect(text(c)).toBe('');
    expect(run('A', c)).toBe('4');
  });

  it('결과 뒤 ◀는 식 끝에서 다시 편집', () => {
    const c = new Calculator();
    type(c, '1+2=');
    c.press('left');
    expect(c.screen).toBe('editing');
    type(c, '0');
    expect(run('', c)).toBe('21');
  });

  it('빈 식에서 = 는 아무 일도 하지 않는다', () => {
    const c = new Calculator();
    expect(c.press('equals')).toEqual([]);
    expect(c.screen).toBe('editing');
  });
});

describe('오류 상태', () => {
  it('오류 중에는 숫자 키를 무시하고 ◀로 오류 위치에 돌아간다', () => {
    const c = new Calculator();
    type(c, '2+*3=');
    expect(c.screen).toBe('error');
    type(c, '5');
    expect(text(c)).toBe('2+×3');
    c.press('left');
    expect(c.screen).toBe('editing');
    expect(c.editor.cursor.index).toBe(2); // × 위치
  });
});

describe('SHIFT / ALPHA', () => {
  it('SHIFT는 다음 키 한 번 뒤 풀린다', () => {
    const c = new Calculator();
    c.press('shift');
    expect(c.shift).toBe(true);
    const ev = c.press('d7'); // SHIFT+7 은 아직 미구현
    expect(ev.some((e) => e.type === 'unimplemented')).toBe(true);
    expect(c.shift).toBe(false);
  });

  it('SHIFT 두 번은 해제, ALPHA는 SHIFT를 끈다', () => {
    const c = new Calculator();
    c.press('shift');
    c.press('shift');
    expect(c.shift).toBe(false);
    c.press('shift');
    c.press('alpha');
    expect([c.shift, c.alpha]).toEqual([false, true]);
  });
});

describe('히스토리', () => {
  it('결과 표시 중 ▲는 그 이전 계산을 불러온다', () => {
    const c = new Calculator();
    type(c, '1+1=');
    type(c, '2+2=');
    c.press('up');
    expect(text(c)).toBe('1+1');
    expect(shown(c)).toBe('2');
    c.press('down');
    expect(text(c)).toBe('2+2');
  });
});
