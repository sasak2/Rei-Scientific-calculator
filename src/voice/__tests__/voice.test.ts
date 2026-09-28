import { describe, expect, it } from 'vitest';
import { splitMora, vowelOf } from '../kana';
import { decodeOto, parseOto, usableLength } from '../oto';
import { planNotes } from '../plan';
import { readDecimal, readForm, readInteger } from '../reading';

describe('oto.ini 파서', () => {
  const text = [
    'あ.wav=,0.0,48.086,77.453,10.774,0.0',
    'か.wav=,39.834,60.261,81.886,38.165,-20.0',
    'ka2.wav=か,1,2,3,4,5', // 같은 별칭은 첫 번째가 이긴다
    'xyz.wav=- さ,10,20,-300,30,5',
    '',
  ].join('\r\n');

  it('빈 별칭은 파일 이름이 된다', () => {
    const oto = parseOto(text, 'voice/');
    expect(oto.get('あ')).toMatchObject({ file: 'voice/あ.wav', offset: 0, consonant: 48.086, preutterance: 10.774 });
    expect(oto.get('か')?.file).toBe('voice/か.wav');
    expect(oto.get('- さ')?.cutoff).toBe(-300);
  });

  it('cutoff: 음수는 offset부터의 길이, 양수는 끝에서 자를 길이', () => {
    const oto = parseOto(text);
    expect(usableLength(oto.get('- さ')!, 1000)).toBe(300);
    expect(usableLength(oto.get('か')!, 600)).toBeCloseTo(600 - 39.834 - 81.886);
  });

  it('Shift_JIS 와 UTF-8 을 구분해 읽는다', () => {
    // "あ.wav=" 의 Shift_JIS 바이트: 82 A0 2E 77 61 76 3D
    const sjis = new Uint8Array([0x82, 0xa0, 0x2e, 0x77, 0x61, 0x76, 0x3d]).buffer;
    expect(decodeOto(sjis)).toBe('あ.wav=');
    const utf8 = new TextEncoder().encode('あ.wav=').buffer as ArrayBuffer;
    expect(decodeOto(utf8)).toBe('あ.wav=');
  });
});

describe('모라 분할', () => {
  it.each([
    ['いち', ['い', 'ち']],
    ['きゅー', ['きゅ']],
    ['はっせん', ['は', null, 'せ', 'ん']],
    ['たんじぇんと', ['た', 'ん', 'じぇ', 'ん', 'と']],
  ])('%s', (text, want) => expect(splitMora(text).map((m) => m.kana)).toEqual(want));

  it('ー 는 앞 모라를 늘인다', () => {
    expect(splitMora('じゅー')).toEqual([{ kana: 'じゅ', beats: 2, vowel: 'u' }]);
  });

  it('모음 판정', () => {
    expect(vowelOf('きゅ')).toBe('u');
    expect(vowelOf('ん')).toBe('n');
    expect(vowelOf('じぇ')).toBe('e');
  });
});

describe('수사 읽기', () => {
  it.each([
    ['0', 'ぜろ'],
    ['7', 'なな'],
    ['10', 'じゅー'],
    ['19', 'じゅーきゅー'],
    ['100', 'ひゃく'],
    ['300', 'さんびゃく'],
    ['600', 'ろっぴゃく'],
    ['800', 'はっぴゃく'],
    ['1000', 'せん'],
    ['3000', 'さんぜん'],
    ['8000', 'はっせん'],
    ['1234', 'せんにひゃくさんじゅーよん'],
    ['10000', 'いちまん'],
    ['20005', 'にまんご'],
    ['100000000', 'いちおく'],
    ['9999999999', 'きゅーじゅーきゅーおくきゅーせんきゅーひゃくきゅーじゅーきゅーまんきゅーせんきゅーひゃくきゅーじゅーきゅー'],
  ])('%s → %s', (n, want) => expect(readInteger(n)).toBe(want));

  it('소수와 한 자리씩 읽기', () => {
    expect(readDecimal('3.14', 'numeral')).toBe('さんてんいちよん');
    expect(readDecimal('0.05', 'numeral')).toBe('ぜろてんぜろご');
    expect(readDecimal('120', 'digits')).toBe('いちにぜろ');
  });

  it('지수·분수·음수', () => {
    expect(readForm({ kind: 'num', num: { neg: true, mantissa: '1.5', exponent: -3 } }, 'numeral')).toEqual([
      'まいなす',
      'いちてんご',
      'かけるじゅーの',
      'まいなすさんじょー',
    ]);
    expect(readForm({ kind: 'frac', neg: false, num: '2', den: '3' }, 'numeral')).toEqual(['さんぶんの', 'に']);
    expect(readForm({ kind: 'frac', neg: false, whole: '1', num: '1', den: '2' }, 'numeral')).toEqual([
      'いちと',
      'にぶんの',
      'いち',
    ]);
  });
});

describe('발음 계획', () => {
  const oto = parseOto(['い.wav=,0,50,60,10,0', 'ち.wav=,50,120,60,60,0', 'さ.wav=,40,140,70,100,30'].join('\n'));
  const lookup = (a: string) => (oto.get(a) ? { entry: oto.get(a)!, fileMs: 700 } : null);

  it('선행발성만큼 앞당기고, 다음 음과 겹치게 끝낸다', () => {
    const plan = planNotes(
      [
        { alias: 'い', length: 120, vowel: 'i' },
        { alias: 'ち', length: 120, vowel: 'i' },
      ],
      lookup,
    );
    const [a, b] = plan.segments;
    expect(a.start).toBe(0); // 첫 박자는 선행발성(10) 뒤에 놓여 시작이 0
    expect(b.start).toBe(10 + 120 - 60); // T1 − 선행발성
    expect(a.start + a.duration).toBe(b.start + 15); // 최소 페이드 길이만큼 겹침
    expect(plan.mouth.map((m) => m.vowel)).toEqual(['i', 'i']);
  });

  it('자음부가 박보다 길면 노트를 늘린다', () => {
    const plan = planNotes([{ alias: 'さ', length: 20, vowel: 'a' }, { alias: 'い', length: 100, vowel: 'i' }], lookup);
    // さ: 자음부 140 − 선행발성 100 = 40, + 최소 모음 35 → 75
    expect(plan.mouth[1].start - plan.mouth[0].start).toBe(75);
  });

  it('원음 길이를 넘지 않는다', () => {
    const plan = planNotes([{ alias: 'い', length: 5000, vowel: 'i' }], lookup);
    expect(plan.segments[0].duration).toBe(700 - 0 - 60);
  });

  it('없는 별칭과 쉼은 조각 없이 시간만 차지한다', () => {
    const plan = planNotes(
      [
        { alias: null, length: 50, vowel: null },
        { alias: 'ぬ', length: 100, vowel: 'u' },
      ],
      lookup,
    );
    expect(plan.segments).toEqual([]);
    expect(plan.total).toBe(150);
  });
});
