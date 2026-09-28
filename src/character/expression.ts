/**
 * 표정 애니메이터: VRM expression(블렌드셰이프 프리셋) 가중치를 선형 크로스페이드한다.
 *
 * three-vrm v3는 VRM 0.x 프리셋 이름을 1.0 이름으로 바꿔 준다 (joy→happy, sorrow→sad, fun→relaxed).
 * 그래서 포즈 JSON은 1.0 이름만 쓰면 된다. 모델에 없는 표정은 조용히 무시된다.
 * 눈 깜빡임(blink)은 idle 레이어가 별도로 관리하므로 여기서는 건드리지 않는다.
 */
import type { VRM } from '@pixiv/three-vrm';

export const EMOTIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'] as const;

export class ExpressionAnimator {
  private readonly from = new Map<string, number>();
  private readonly to = new Map<string, number>();
  private readonly current = new Map<string, number>();
  private elapsed = 1;
  private duration = 1;

  constructor(private readonly vrm: VRM) {
    for (const e of EMOTIONS) this.current.set(e, 0);
  }

  play(weights: Record<string, number> = {}, durationMs = 220): void {
    const names = new Set([...EMOTIONS, ...Object.keys(weights)]);
    for (const n of names) {
      this.from.set(n, this.current.get(n) ?? 0);
      this.to.set(n, weights[n] ?? 0);
    }
    this.elapsed = 0;
    this.duration = Math.max(1, durationMs) / 1000;
  }

  update(dt: number): void {
    const mgr = this.vrm.expressionManager;
    if (!mgr) return;
    this.elapsed = Math.min(this.elapsed + dt, this.duration);
    const t = this.elapsed / this.duration;
    for (const [n, target] of this.to) {
      const w = (this.from.get(n) ?? 0) + (target - (this.from.get(n) ?? 0)) * t;
      this.current.set(n, w);
      if (mgr.getExpression(n)) mgr.setValue(n, w);
    }
  }
}
