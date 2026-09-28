/**
 * UTAU 원음 설정 파일(oto.ini) 파서.
 *
 * 한 줄 형식:   파일.wav=별칭,offset,자음부,cutoff,선행발성,오버랩   (단위: ms)
 *
 *   ┌offset┐┌──자음부──┐┌────── 모음(늘어나는 부분) ──────┐┌cutoff┐
 *   |░░░░░░|▓▓▓▓▓▓▓▓▓▓|▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒|░░░░░░|
 *          ↑        ↑ 선행발성: 이 지점이 "박자"에 맞춰진다
 *          └ 재생 시작점
 *
 * - offset     : 파일 앞의 쓰지 않는 구간
 * - 자음부     : 늘이지 않고 그대로 재생해야 하는 구간 (자음 + 모음 시작)
 * - cutoff     : 양수면 파일 끝에서 잘라낼 길이, 음수면 offset부터 잰 사용 구간 길이
 * - 선행발성   : 자음이 박자보다 먼저 나오도록 음을 앞당기는 양 (예: "さ"의 s 소리)
 * - 오버랩     : 앞 음과 겹쳐서 크로스페이드하는 길이
 *
 * 별칭이 비어 있으면 파일 이름(확장자 제외)이 별칭이 된다 (단독음 음원에서 흔함).
 */
export interface OtoEntry {
  file: string;
  alias: string;
  offset: number;
  consonant: number;
  cutoff: number;
  preutterance: number;
  overlap: number;
}

export function parseOto(text: string, dir = ''): Map<string, OtoEntry> {
  const map = new Map<string, OtoEntry>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (!line || eq < 0) continue;
    const file = line.slice(0, eq);
    const [alias = '', ...nums] = line.slice(eq + 1).split(',');
    const [offset, consonant, cutoff, preutterance, overlap] = nums.map((n) => Number(n) || 0);
    const name = alias || file.replace(/\.wav$/i, '');
    if (map.has(name)) continue; // 같은 별칭이 여러 번 나오면 첫 번째를 쓴다
    map.set(name, {
      file: dir + file,
      alias: name,
      offset: offset ?? 0,
      consonant: consonant ?? 0,
      cutoff: cutoff ?? 0,
      preutterance: preutterance ?? 0,
      overlap: overlap ?? 0,
    });
  }
  return map;
}

/**
 * oto.ini 인코딩 판별. 일본어 UTAU 음원은 대부분 Shift_JIS지만 최근 것은 UTF-8도 있다.
 * UTF-8로 엄격하게(fatal) 디코딩해 보고 실패하면 Shift_JIS로 읽는다.
 */
export function decodeOto(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

/** 사용 가능한 구간 길이(ms): offset부터 cutoff까지 */
export function usableLength(e: OtoEntry, fileMs: number): number {
  return e.cutoff < 0 ? -e.cutoff : Math.max(0, fileMs - e.offset - e.cutoff);
}
