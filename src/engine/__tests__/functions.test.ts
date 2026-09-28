import { describe, expect, it } from 'vitest';
import { Calculator } from '../calculator';
import { linearCells } from '../input/editor';
import { run, shown, type } from './helpers';

/** SETUP 메뉴로 각도 단위를 바꾼 계산기 */
function withAngle(unit: 'deg' | 'rad' | 'gra'): Calculator {
  const c = new Calculator();
  type(c, `[S][mode]${{ deg: 3, rad: 4, gra: 5 }[unit]}`);
  return c;
}
const runRad = (expr: string) => run(expr, withAngle('rad'));
const runGra = (expr: string) => run(expr, withAngle('gra'));

describe('삼각함수 (Deg)', () => {
  it.each([
    ['[sin]30)', '0.5'],
    ['[cos]60)', '0.5'],
    ['[tan]45)', '1'],
    ['[sin]180)', '0'], // Math.sin(π)=1.2e-16 이지만 특수각 처리로 정확히 0
    ['[cos]90)', '0'],
    ['[sin]~30)', '-0.5'],
    ['[sin]390)', '0.5'],
    ['[sin]45)', '0.7071067812'],
    ['[sin]60)', '0.8660254038'],
    ['[tan]90)', 'Math ERROR'],
    ['[tan]~270)', 'Math ERROR'],
    ['[sin]9E9)', 'Math ERROR'], // 입력 한계 |x| < 9×10^9
    ['[S][sin]0.5)', '30'],
    ['[S][cos]0.5)', '60'],
    ['[S][tan]1)', '45'],
    ['[S][sin]2)', 'Math ERROR'],
    ['2[sin]30)', '1'], // 생략된 곱셈
    ['[sin]30', '0.5'], // 닫는 괄호 생략
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));
});

describe('삼각함수 (Rad, Gra)', () => {
  it('Rad: sin(π) = 0, cos(π) = -1', () => {
    expect(runRad('[sin][S][exp])')).toBe('0');
    expect(runRad('[cos][S][exp])')).toBe('-1');
    expect(runRad('[sin][S][exp]/6)')).toBe('0.5');
    expect(runRad('[S][sin]1)')).toBe('1.570796327');
  });
  it('Gra: sin(100) = 1', () => {
    expect(runGra('[sin]100)')).toBe('1');
    expect(runGra('[S][tan]1)')).toBe('50');
  });
});

describe('쌍곡선 함수 (hyp 메뉴)', () => {
  it.each([
    ['[hyp]11)', '1.175201194'],
    ['[hyp]20)', '1'],
    ['[hyp]31)', '0.761594156'],
    ['[hyp]41)', '0.881373587'],
    ['[hyp]52)', '1.316957897'],
    ['[hyp]50.5)', 'Math ERROR'],
    ['[hyp]62)', 'Math ERROR'],
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));

  it('hyp 메뉴는 AC로 닫힌다', () => {
    const c = new Calculator();
    c.press('hyp');
    expect(c.menu?.id).toBe('hyp');
    c.press('ac');
    expect(c.menu).toBeNull();
  });
});

describe('로그 · 지수', () => {
  it.each([
    ['[log]100)', '2'],
    ['[log]0.001)', '-3'],
    ['[log]2)', '0.3010299957'],
    ['[log]2[S][rparen]8)', '3'], // log(2,8): 밑 2
    ['[logab]3[S][rparen]81)', '4'],
    ['[log]1[S][rparen]5)', 'Math ERROR'],
    ['[ln]1)', '0'],
    ['[ln][A][exp])', '1'], // ln(e)
    ['[ln]0)', 'Math ERROR'],
    ['[log]~1)', 'Math ERROR'],
    ['[S][log]3)', '1000'],
    ['[S][log]~2)', '0.01'],
    ['[S][ln]1)', '2.718281828'],
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));
});

describe('거듭제곱 · 거듭제곱근', () => {
  it.each([
    ['2[pow]10)', '1024'],
    ['2[pow]0.5)', '1.414213562'],
    ['2[pow]~2)', '0.25'],
    ['(~8)[pow]1[frac]3)', '-2'], // 홀수 제곱근은 음수 밑 허용
    ['(~8)[pow]0.5)', 'Math ERROR'],
    ['0[pow]0)', 'Math ERROR'],
    ['3[S][pow]27)', '3'], // 3ˣ√(27)
    ['[sqrt]16)', '4'],
    ['[sqrt]2)', '1.414213562'],
    ['[sqrt]~1)', 'Math ERROR'],
    ['[S][sqrt]~27)', '-3'],
    ['2[S][sq]', '8'],
    ['[sqrt]2)²', '2'],
    ['2[pow]3)²', '64'],
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));
});

describe('계승 · 순열 · 조합 · %', () => {
  it.each([
    ['5[S][inv]', '120'],
    ['0[S][inv]', '1'],
    ['69[S][inv]', '1.711224524e98'],
    ['70[S][inv]', 'Math ERROR'],
    ['0.5[S][inv]', 'Math ERROR'],
    ['10[S][mul]3', '720'],
    ['10[S][div]3', '120'],
    ['5[S][div]6', 'Math ERROR'],
    ['2*10[S][div]3', '240'],
    ['150*20[S][lparen]', '30'],
    ['660/880[S][lparen]', '75'],
    ['[S][hyp]~5)', '5'],
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));
});

describe('상수 · 생략된 곱셈', () => {
  it.each([
    ['[S][exp]', '3.141592654'],
    ['2[S][exp]', '6.283185307'],
    ['1/2[S][exp]', '0.1591549431'], // 1÷(2π)
    ['[A][exp]', '2.718281828'],
    ['[S][exp]2', 'Syntax ERROR'], // 상수 뒤 숫자는 곱셈 생략 불가
    ['[sin]30)[cos]60)', '0.25'],
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));
});

describe('분수 (LineIO)', () => {
  it.each([
    ['1[frac]2+1[frac]3', '5⌟6'],
    ['2[frac]4', '1⌟2'],
    ['1[frac]3*3', '1'],
    ['1[frac]2[frac]3', '5⌟3'], // 대분수 입력, 기본 d/c 표시
    ['~1[frac]2', '-1⌟2'],
    ['[sqrt]4[frac]9)', '2⌟3'],
    ['1[frac]12345+1[frac]54321', '9.941354197e-5'], // 10자리를 넘는 분수는 소수로
    ['1[frac]0', 'Math ERROR'],
    ['0.5+1[frac]4', '3⌟4'],
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));

  it('S⇔D 로 분수와 소수를 오간다', () => {
    const c = new Calculator();
    expect(run('1[frac]2+1[frac]3', c)).toBe('5⌟6');
    c.press('sd');
    expect(shown(c)).toBe('0.8333333333');
    c.press('sd');
    expect(shown(c)).toBe('5⌟6');
  });

  it('소수 결과도 분수로 바꿀 수 있다 (연분수 복원 포함)', () => {
    const c = new Calculator();
    expect(run('1/3', c)).toBe('0.3333333333');
    c.press('sd');
    expect(shown(c)).toBe('1⌟3');
    expect(run('[sin]30)', c)).toBe('0.5');
    c.press('sd');
    expect(shown(c)).toBe('1⌟2');
    expect(run('[S][exp]', c)).toBe('3.141592654');
    c.press('sd');
    expect(shown(c)).toBe('3.141592654'); // π는 분수로 나타낼 수 없다
  });

  it('SHIFT S⇔D 로 대분수 ⇔ 가분수', () => {
    const c = new Calculator();
    run('5[frac]3', c);
    type(c, '[S][sd]');
    expect(shown(c)).toBe('1⌟2⌟3');
    type(c, '[S][sd]');
    expect(shown(c)).toBe('5⌟3');
  });

  it('SETUP ab/c 이면 처음부터 대분수', () => {
    const c = new Calculator();
    type(c, '[S][mode][down]1');
    expect(run('7[frac]2', c)).toBe('3⌟1⌟2');
  });
});

describe('60진법 · DRG', () => {
  it.each([
    ['2[dms]30[dms]', '2.5'],
    ['2[dms]30', '2.5'],
    ['1[dms]0[dms]0[dms]+0[dms]30[dms]0[dms]', '1.5'],
    ['[dms]5', 'Syntax ERROR'],
    ['[S][exp][S][ans]2', '180'], // Deg 모드에서 π 라디안
    ['100[S][ans]3', '90'], // 100 그라드
  ])('%s = %s', (expr, want) => expect(run(expr)).toBe(want));

  it('결과에서 °\'" 를 누르면 60진법 표시', () => {
    const c = new Calculator();
    run('2.5', c);
    c.press('dms');
    expect(shown(c)).toBe('2°30°0°');
    type(c, '[S][dms]');
    expect(shown(c)).toBe('2.5');
    run('1/3', c);
    c.press('dms');
    expect(shown(c)).toBe('0°20°0°');
  });

  it('Rad 모드에서 180° → π', () => {
    expect(runRad('180[S][ans]1')).toBe('3.141592654');
  });
});

describe('표시 형식 (Fix / Sci / Norm / ENG)', () => {
  const withFormat = (keys: string) => {
    const c = new Calculator();
    type(c, keys);
    return c;
  };

  it('Fix 2', () => {
    const c = withFormat('[S][mode]62');
    expect(run('1/3', c)).toBe('0.33');
    expect(run('2', c)).toBe('2.00');
    expect(run('~2/3', c)).toBe('-0.67');
    expect(run('0.004', c)).toBe('0.00');
    expect(run('[S][d0]1/3)*3', c)).toBe('0.99'); // Rnd 는 표시 자릿수로 반올림
  });

  it('Sci 3', () => {
    const c = withFormat('[S][mode]73');
    expect(run('1234', c)).toBe('1.23e3');
    expect(run('2', c)).toBe('2.00e0');
  });

  it('Norm 2: 0.001 을 고정소수로', () => {
    expect(run('0.001')).toBe('1e-3');
    expect(run('0.001', withFormat('[S][mode]82'))).toBe('0.001');
  });

  it('ENG 와 ←ENG', () => {
    const c = new Calculator();
    run('1234', c);
    c.press('eng');
    expect(shown(c)).toBe('1.234e3');
    c.press('eng');
    expect(shown(c)).toBe('1234e0');
    run('1234', c);
    type(c, '[S][eng]');
    expect(shown(c)).toBe('0.001234e6');
    run('0.0123', c);
    c.press('eng');
    expect(shown(c)).toBe('12.3e-3');
  });
});

describe('변수 · 메모리', () => {
  it('STO / 변수 사용 / RCL', () => {
    const c = new Calculator();
    type(c, '5[S][rcl][neg]'); // 5 → A
    expect(shown(c)).toBe('5');
    expect(c.exprNote?.text).toBe('→A');
    expect(run('[A][neg]*2', c)).toBe('10');
    c.press('ac');
    type(c, '[rcl][neg]');
    expect(shown(c)).toBe('5');
    expect(c.exprNote).toEqual({ text: 'A=', replace: true });
    expect(run('3[A][neg]', c)).toBe('15'); // 3A
  });

  it('결과 표시 중 STO 는 Ans를 저장', () => {
    const c = new Calculator();
    run('7*6', c);
    type(c, '[S][rcl][sin]'); // → D
    expect(linearCells(c.editor, false).join('')).toBe('Ans');
    expect(run('[A][sin]', c)).toBe('42');
  });

  it('M+ / M−', () => {
    const c = new Calculator();
    type(c, '3[mplus]');
    expect(c.memoryIndicator).toBe(true);
    type(c, '2+2[mplus]');
    expect(run('[A][mplus]', c)).toBe('7');
    type(c, '10[S][mplus]');
    expect(run('[A][mplus]', c)).toBe('-3');
  });

  it('CLR Memory 는 변수와 Ans를 지운다', () => {
    const c = new Calculator();
    type(c, '5[S][rcl][neg]');
    type(c, '[S][d9]2=');
    expect(c.screen).toBe('message');
    expect(c.message).toBe('Clear Memory');
    c.press('ac');
    expect(run('[A][neg]+A', c)).toBe('0');
  });

  it('CLR Setup 은 각도 단위를 되돌린다', () => {
    const c = withAngle('rad');
    type(c, '[S][d9]1=');
    c.press('ac');
    expect(c.setup.angle).toBe('deg');
  });
});

describe('Pol / Rec', () => {
  it('Pol(1,1) → r, θ 그리고 X, Y 에 저장', () => {
    const c = new Calculator();
    expect(run('[S][add]1[S][rparen]1)', c)).toBe('r=1.414213562,θ=45');
    expect(run('[A][rparen]', c)).toBe('1.414213562');
    expect(run('[A][sd]', c)).toBe('45');
  });
  it('Rec(2,60) → X, Y', () => {
    expect(run('[S][sub]2[S][rparen]60)')).toBe('X=1,Y=1.732050808');
  });
  it('Pol 은 식 안에서 쓸 수 없다', () => {
    expect(run('1+[S][add]1[S][rparen]1)')).toBe('Syntax ERROR');
  });
});

describe('난수', () => {
  it('Ran# 은 3자리, RanInt# 은 정수', () => {
    expect(run('[S][dot]', new Calculator(() => 0.12345))).toBe('0.123');
    expect(run('[A][dot]1[S][rparen]6)', new Calculator(() => 0.5))).toBe('4');
    expect(run('[A][dot]6[S][rparen]1)', new Calculator(() => 0.5))).toBe('Math ERROR');
  });
});

describe('메뉴와 미구현 항목', () => {
  it('MODE 2 (CMPLX)는 아직 미구현 이벤트', () => {
    const c = new Calculator();
    c.press('mode');
    const ev = c.press('d2');
    expect(ev.some((e) => e.type === 'unimplemented')).toBe(true);
  });

  it('INS 로 덮어쓰기 모드', () => {
    const c = new Calculator();
    type(c, '123[left][left]');
    type(c, '[S][del]9');
    expect(linearCells(c.editor, false).join('')).toBe('193');
  });
});
