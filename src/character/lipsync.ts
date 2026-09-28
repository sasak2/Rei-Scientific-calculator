/**
 * 립싱크: 음성 발음 계획의 모음 타임라인을 VRM 입 모양 표정(aa/ih/ou/ee/oh)으로 옮긴다.
 *
 * 음성과 같은 "오디오 시계"(AudioContext.currentTime)를 기준으로 현재 모음을 찾기 때문에
 * 렌더링 프레임이 흔들려도 소리와 입이 어긋나지 않는다.
 * 모음이 바뀔 때 입이 뚝뚝 끊기지 않도록 목표 가중치를 향해 지수적으로 따라간다:
 *   w ← w + (target − w)·(1 − e^(−dt/τ))   (τ ≈ 40ms, 1차 저역통과 필터와 같은 꼴)
 */
import type { VRM } from '@pixiv/three-vrm';
import type { Vowel } from '../voice/kana';
import type { MouthKey } from '../voice/plan';

const SHAPES = ['aa', 'ih', 'ou', 'ee', 'oh'] as const;
const VOWEL_SHAPE: Record<Vowel, { shape: (typeof SHAPES)[number]; weight: number }> = {
  a: { shape: 'aa', weight: 0.85 },
  i: { shape: 'ih', weight: 0.7 },
  u: { shape: 'ou', weight: 0.7 },
  e: { shape: 'ee', weight: 0.75 },
  o: { shape: 'oh', weight: 0.8 },
  n: { shape: 'ou', weight: 0.2 }, // ん: 입을 거의 닫는다
};
const TAU = 0.04;

export class LipSync {
  private keys: MouthKey[] = [];
  private startAt = 0;
  private now: () => number = () => 0;
  private readonly weights: Record<string, number> = Object.fromEntries(SHAPES.map((s) => [s, 0]));

  constructor(private readonly vrm: VRM) {}

  play(keys: MouthKey[], startAt: number, now: () => number): void {
    this.keys = keys;
    this.startAt = startAt;
    this.now = now;
  }

  update(dt: number): void {
    const mgr = this.vrm.expressionManager;
    if (!mgr) return;
    const t = (this.now() - this.startAt) * 1000;
    // 모음 끝부분 20%는 입을 닫아 가며 다음 모라와 구분되게 한다
    const key = this.keys.find((k) => t >= k.start && t < k.end - (k.end - k.start) * 0.2);
    const target = key ? VOWEL_SHAPE[key.vowel] : null;
    const a = 1 - Math.exp(-dt / TAU);
    for (const s of SHAPES) {
      const goal = target && target.shape === s ? target.weight : 0;
      this.weights[s] += (goal - this.weights[s]) * a;
      if (mgr.getExpression(s)) mgr.setValue(s, this.weights[s]);
    }
    if (this.keys.length && t > this.keys[this.keys.length - 1].end + 200) this.keys = [];
  }
}
