/**
 * 발음 계획: 모라 목록 + oto 설정 → 오디오 조각 재생 일정 (순수 함수, 테스트 가능).
 *
 * ── UTAU식 이어 붙이기 ────────────────────────────────────────────────
 *  노트 i의 "박자 시작"을 T_i 라 하면
 *    - 조각 재생 시작 = T_i − 선행발성_i      (자음이 박자보다 먼저 나와야 자연스럽다)
 *    - 파일 안 재생 시작점 = offset_i
 *    - 조각 재생 끝 = T_{i+1} − 선행발성_{i+1} + 오버랩_{i+1}
 *      (다음 음이 시작한 뒤 오버랩 길이만큼 겹쳐 두고, 그 사이를 크로스페이드)
 *
 *  시간 →       T_i                          T_{i+1}
 *   조각 i   ├──자음──┼──────모음────────────────┤╲  (fade out)
 *   조각 i+1                        ╱├──자음──┼──모음──…
 *                                    └ 선행발성_{i+1}
 *
 *  실제 UTAU는 리샘플러로 모음 구간을 늘이거나 줄이고 음높이를 바꾸지만, 여기서는
 *  "말하기" 용도라 음높이는 원음 그대로 두고 모음 구간을 잘라 쓰기만 한다(잘라내기 = 시간 축소).
 *  단, 자음부(고정 구간)는 잘리면 발음이 뭉개지므로, 노트 길이를 최소한 자음부 + 여유만큼 확보한다.
 */
import { usableLength, type OtoEntry } from './oto';
import type { Vowel } from './kana';

export interface NoteSpec {
  /** 음원 별칭. null이면 무음(쉼) */
  alias: string | null;
  /** 박 길이 (ms) */
  length: number;
  vowel: Vowel | null;
}

export interface Segment {
  alias: string;
  file: string;
  /** 오디오 재생 시작 (계획 시작 기준 ms) */
  start: number;
  /** 파일 안에서 재생을 시작할 위치 (ms) */
  offset: number;
  /** 재생 길이 (ms) */
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

export interface MouthKey {
  start: number;
  end: number;
  vowel: Vowel;
}

export interface Plan {
  segments: Segment[];
  mouth: MouthKey[];
  /** 전체 길이 (ms) */
  total: number;
}

/** 모음부를 최소한 이만큼은 남긴다 (ms) */
const MIN_VOWEL = 35;
const MIN_FADE_IN = 5;
const MIN_FADE_OUT = 15;
const TAIL = 40;

export function planNotes(
  notes: NoteSpec[],
  lookup: (alias: string) => { entry: OtoEntry; fileMs: number } | null,
): Plan {
  // 1) 각 노트의 박자 시작 시각을 정한다
  type Placed = { note: NoteSpec; entry: OtoEntry | null; fileMs: number; beat: number; end: number };
  const placed: Placed[] = [];
  const first = notes.find((n) => n.alias && lookup(n.alias));
  let t = first ? lookup(first.alias!)!.entry.preutterance : 0; // 첫 음의 선행발성만큼 여유를 두어 시작이 0 이상
  for (const note of notes) {
    const hit = note.alias ? lookup(note.alias) : null;
    let len = note.length;
    if (hit) {
      const fixed = hit.entry.consonant - hit.entry.preutterance; // 박자 이후에 남은 자음부
      len = Math.max(len, fixed + MIN_VOWEL);
    }
    placed.push({ note, entry: hit?.entry ?? null, fileMs: hit?.fileMs ?? 0, beat: t, end: t + len });
    t += len;
  }

  // 2) 조각의 시작·끝과 페이드를 정한다
  const segments: Segment[] = [];
  const mouth: MouthKey[] = [];
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (p.note.vowel) mouth.push({ start: p.beat, end: p.end, vowel: p.note.vowel });
    if (!p.entry) continue;
    const e = p.entry;
    const start = p.beat - e.preutterance;
    const next = placed[i + 1];
    let end: number;
    let fadeOut: number;
    if (next?.entry) {
      fadeOut = Math.max(next.entry.overlap, MIN_FADE_OUT);
      end = next.beat - next.entry.preutterance + fadeOut;
    } else {
      fadeOut = TAIL;
      end = p.end + TAIL;
    }
    const avail = usableLength(e, p.fileMs);
    let duration = end - start;
    if (duration > avail) {
      duration = avail; // 원음이 짧으면 거기까지만 (자연스럽게 끝나도록 페이드는 짧게)
      fadeOut = Math.min(fadeOut, duration / 2);
    }
    segments.push({
      alias: e.alias,
      file: e.file,
      start,
      offset: e.offset,
      duration: Math.max(0, duration),
      fadeIn: Math.min(Math.max(e.overlap, MIN_FADE_IN), duration / 2),
      fadeOut,
    });
  }
  const total = Math.max(t, ...segments.map((s) => s.start + s.duration));
  return { segments, mouth, total };
}
