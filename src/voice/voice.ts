/**
 * Voice: 읽기 → 모라 → 발음 계획 → Web Audio 재생.
 *
 * ── Web Audio 그래프 ──────────────────────────────────────────────────
 *   AudioBufferSourceNode(조각) → GainNode(조각별 페이드) ─┐
 *   AudioBufferSourceNode(조각) → GainNode(조각별 페이드) ─┼→ master Gain → Compressor → 스피커
 *   …                                                     ─┘
 * 조각마다 source.start(when, offset, duration)으로 "오디오 시계" 기준 시각에 예약한다.
 * setTimeout으로 하나씩 틀면 JS 타이머 오차(수~수십 ms)로 박자가 흔들리지만,
 * 오디오 스레드에 미리 예약하면 샘플 단위로 정확하다.
 * 겹치는 구간에서 합이 1을 넘을 수 있으므로 컴프레서로 클리핑을 막는다.
 */
import type { DisplayForm } from '../engine/format/display';
import type { TokenId } from '../engine/input/tokens';
import { splitMora, VOWEL_KANA } from './kana';
import { decodeOto, parseOto, type OtoEntry } from './oto';
import { planNotes, type MouthKey, type NoteSpec } from './plan';
import { ERROR_READING, EQUALS_READING, readForm, readToken, TOKEN_READING, type Phrase, type ReadingStyle } from './reading';

/** 음원 파일을 읽어 오는 방법 (개발 서버 URL 또는 사용자가 고른 파일) */
export interface VoiceSource {
  read(path: string): Promise<ArrayBuffer | null>;
}

export interface VoiceOptions {
  style: ReadingStyle;
  readKeys: boolean;
  readResult: boolean;
  volume: number;
  muted: boolean;
  /** 모라 한 박 길이 (ms) */
  moraMs: number;
}

/** 입 모양 콜백: 계획(ms)과 그 시작 시각(오디오 시계, 초), 현재 오디오 시각을 주는 함수 */
export type MouthListener = (keys: MouthKey[], startAt: number, now: () => number) => void;

const WORD_GAP = 50;
const SOKUON = 70; // っ 무음 길이

export class Voice {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private oto: Map<string, OtoEntry> | null = null;
  private source: VoiceSource | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private active: AudioBufferSourceNode[] = [];
  private speakId = 0;
  onMouth: MouthListener | null = null;

  constructor(public opts: VoiceOptions) {}

  get loaded(): boolean {
    return !!this.oto;
  }

  /** 음원 불러오기: oto.ini만 먼저 읽고, wav는 필요할 때 디코딩한다. 반환값은 별칭 수 */
  async load(source: VoiceSource, otoPath = 'oto.ini'): Promise<number> {
    const buf = await source.read(otoPath);
    if (!buf) throw new Error('oto.ini를 읽을 수 없습니다');
    const dir = otoPath.includes('/') ? otoPath.slice(0, otoPath.lastIndexOf('/') + 1) : '';
    this.stop();
    this.oto = parseOto(decodeOto(buf), dir);
    this.source = source;
    this.buffers.clear();
    this.prefetch();
    return this.oto.size;
  }

  /** 자주 쓰는 모라(키 읽기 표에 나오는 것)를 미리 디코딩해 첫 재생 지연을 줄인다 */
  private prefetch(): void {
    const kana = new Set<string>();
    for (const r of Object.values(TOKEN_READING)) for (const m of splitMora(r)) if (m.kana) kana.add(m.kana);
    for (const k of kana) {
      const e = this.resolve(k);
      if (e) void this.buffer(e.file);
    }
  }

  /** AudioContext는 사용자 제스처(키 누름) 안에서 만들거나 재개해야 소리가 난다 */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyVolume();
  }

  setMuted(m: boolean): void {
    this.opts.muted = m;
    this.applyVolume();
    if (m) this.stop();
  }

  setVolume(v: number): void {
    this.opts.volume = v;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.opts.muted ? 0 : this.opts.volume;
  }

  private resolve(kana: string): OtoEntry | null {
    return this.oto?.get(kana) ?? this.oto?.get(`- ${kana}`) ?? null;
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      p = (async () => {
        const data = await this.source?.read(file);
        if (!data) return null;
        // decodeAudioData에는 컨텍스트가 필요하다. 아직 없으면(첫 키 전) 디코딩 전용 오프라인 컨텍스트 사용
        const decoder = this.ctx ?? new OfflineAudioContext(1, 1, 44100);
        try {
          return await decoder.decodeAudioData(data);
        } catch {
          return null;
        }
      })();
      this.buffers.set(file, p);
    }
    return p;
  }

  // ------------------------------------------------------------------ 말하기

  speakToken(id: TokenId): void {
    if (this.opts.readKeys) void this.speak(readToken(id));
  }

  speakResult(form: DisplayForm): void {
    if (this.opts.readResult) void this.speak([EQUALS_READING, ...readForm(form, this.opts.style)]);
  }

  speakError(): void {
    if (this.opts.readResult) void this.speak(ERROR_READING);
  }

  stop(): void {
    this.speakId++;
    for (const s of this.active) {
      try {
        s.stop();
      } catch {
        /* 이미 끝난 소스 */
      }
    }
    this.active = [];
    this.onMouth?.([], 0, () => 0);
  }

  /** 단어 목록을 발음한다. 새로 말하면 이전 발화는 끊는다. */
  async speak(words: Phrase): Promise<void> {
    if (!this.oto || this.opts.muted) return;
    this.unlock();
    this.stop();
    const id = this.speakId;
    const ctx = this.ctx!;
    const oto = this.oto;

    const notes = this.toNotes(words);
    const files = new Set<string>();
    for (const n of notes) if (n.alias) files.add(oto.get(n.alias)!.file);
    const bufs = new Map<string, AudioBuffer | null>();
    await Promise.all([...files].map(async (f) => bufs.set(f, await this.buffer(f))));
    if (id !== this.speakId) return; // 기다리는 동안 다른 키가 눌렸다

    const plan = planNotes(notes, (alias) => {
      const entry = oto.get(alias);
      const buf = entry ? bufs.get(entry.file) : null;
      return entry && buf ? { entry, fileMs: buf.duration * 1000 } : null;
    });

    const t0 = ctx.currentTime + 0.02;
    for (const seg of plan.segments) {
      const buf = bufs.get(seg.file);
      if (!buf || seg.duration <= 0) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const start = t0 + seg.start / 1000;
      const dur = seg.duration / 1000;
      // 선형 페이드: 조각 경계의 불연속(클릭 잡음)을 없앤다
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(1, start + seg.fadeIn / 1000);
      g.gain.setValueAtTime(1, start + dur - seg.fadeOut / 1000);
      g.gain.linearRampToValueAtTime(0, start + dur);
      src.connect(g).connect(this.master!);
      src.start(start, seg.offset / 1000, dur);
      src.onended = () => {
        this.active = this.active.filter((s) => s !== src);
      };
      this.active.push(src);
    }
    this.onMouth?.(plan.mouth, t0, () => ctx.currentTime);
  }

  /** 단어 → 노트. 음원에 없는 모라는 같은 모음의 あ행 글자로 대신한다 */
  private toNotes(words: Phrase): NoteSpec[] {
    const notes: NoteSpec[] = [];
    const ms = this.opts.moraMs;
    words.forEach((w, wi) => {
      if (wi > 0) notes.push({ alias: null, length: WORD_GAP, vowel: null });
      for (const m of splitMora(w)) {
        if (!m.kana) {
          notes.push({ alias: null, length: SOKUON, vowel: null });
          continue;
        }
        const entry = this.resolve(m.kana) ?? (m.vowel ? this.resolve(VOWEL_KANA[m.vowel]) : null);
        const len = ms * m.beats * (m.kana === 'ん' ? 0.85 : 1);
        notes.push({ alias: entry?.alias ?? null, length: len, vowel: m.vowel });
      }
    });
    return notes;
  }
}

// ------------------------------------------------------------------ 음원 공급원

/** 사용자가 고른 폴더 (oto.ini 기준 상대 경로 → File) */
export function fileMapSource(files: Map<string, File>): VoiceSource {
  return {
    async read(path) {
      const f = files.get(path);
      return f ? f.arrayBuffer() : null;
    },
  };
}

/** 개발 서버의 로컬 assets/ (URL 기반) */
export function urlSource(base: string): VoiceSource {
  return {
    async read(path) {
      const res = await fetch(base + path.split('/').map(encodeURIComponent).join('/'));
      return res.ok ? res.arrayBuffer() : null;
    },
  };
}
