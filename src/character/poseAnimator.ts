/**
 * PoseAnimator: 포즈 사이를 구면 선형 보간(slerp)으로 부드럽게 전환한다.
 *
 * ── 왜 오일러 각을 직접 보간하지 않고 쿼터니언 slerp인가? ──────────────
 *  1) 오일러 각은 같은 방향을 여러 값으로 표현할 수 있고(예: z=+170° 와 z=-190°),
 *     각 성분을 따로 선형 보간하면 "먼 길"로 돌아가는 경우가 생긴다.
 *  2) 세 축 회전을 순서대로 합성하므로, 중간 값이 두 포즈 사이의 자연스러운 경로가 아니다.
 *     특히 한 축이 ±90°에 가까우면 두 축이 겹치는 짐벌락(gimbal lock)으로 이상하게 꺾인다.
 *
 *  단위 쿼터니언은 4차원 단위 구 위의 점이고, slerp는 두 점을 잇는 대원(great circle) 위를
 *  등속으로 이동한다:  slerp(q0, q1, t) = sin((1-t)Ω)/sinΩ · q0 + sin(tΩ)/sinΩ · q1
 *  (Ω = 두 쿼터니언 사이 각). 결과가 "한 축을 중심으로 일정한 각속도로 도는" 최단 회전이 된다.
 *  q와 -q는 같은 회전이므로, 내적이 음수면 한쪽 부호를 뒤집어 짧은 쪽 호를 고른다
 *  (three.js의 Quaternion.slerp가 내부에서 처리한다).
 *
 *  시간축에는 이징 함수를 씌워 t를 비선형으로 만든다: 출발은 빠르게, 도착은 부드럽게(easeOutCubic).
 *
 * ── 전환 중에 새 키가 눌리면? ─────────────────────────────────────────
 *  "현재 보이는 회전"을 새 출발점으로 잡는다. 그래서 연타해도 튀지 않고 이어진다.
 */
import { Quaternion } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { EASINGS, eulerDegToQuat, isVRM0, POSES, trackedBones, type PoseDef } from './pose';

interface Track {
  from: Quaternion;
  to: Quaternion;
  /** 이번 프레임의 기본 회전 (idle 레이어를 얹기 전 값) */
  current: Quaternion;
}

const IDENTITY = new Quaternion();
export const IDLE_BONES: VRMHumanBoneName[] = ['spine', 'chest', 'neck', 'head'];

export class PoseAnimator {
  private readonly tracks = new Map<VRMHumanBoneName, Track>();
  private elapsed = 0;
  private duration = 1;
  private ease = EASINGS.easeOutCubic;
  private readonly vrm0: boolean;

  constructor(
    private readonly vrm: VRM,
    private readonly base: PoseDef = POSES.rest,
  ) {
    this.vrm0 = isVRM0(vrm);
    // idle 레이어(호흡)가 곱해지는 본도 매 프레임 기본값을 다시 써야 누적되지 않으므로 항상 추적한다
    const names = new Set<VRMHumanBoneName>([...trackedBones(), ...IDLE_BONES]);
    for (const name of names) {
      if (!vrm.humanoid.getNormalizedBoneNode(name)) continue; // 모델에 없는 본(선택 본)은 무시
      const q = this.targetOf(base, name);
      this.tracks.set(name, { from: q.clone(), to: q.clone(), current: q.clone() });
    }
    this.elapsed = this.duration;
  }

  /** 포즈에 없는 본은 기본(rest) 포즈 값으로 */
  private targetOf(pose: PoseDef, name: VRMHumanBoneName): Quaternion {
    const v = pose.bones[name] ?? this.base.bones[name];
    return v ? eulerDegToQuat(v, this.vrm0) : IDENTITY.clone();
  }

  play(pose: PoseDef): void {
    for (const [name, tr] of this.tracks) {
      tr.from.copy(tr.current);
      tr.to.copy(this.targetOf(pose, name));
    }
    this.elapsed = 0;
    this.duration = Math.max(1, pose.duration ?? 220) / 1000;
    this.ease = EASINGS[pose.easing ?? 'easeOutCubic'];
  }

  /** 보간 없이 즉시 적용 (포즈 에디터용) */
  set(pose: PoseDef): void {
    for (const [name, tr] of this.tracks) {
      const q = this.targetOf(pose, name);
      tr.from.copy(q);
      tr.to.copy(q);
      tr.current.copy(q);
    }
    this.elapsed = this.duration;
  }

  /** 매 프레임: 기본 회전을 계산해 정규화 본에 쓴다. idle 레이어는 그 다음에 곱해진다. */
  update(dt: number): void {
    this.elapsed = Math.min(this.elapsed + dt, this.duration);
    const t = this.ease(this.elapsed / this.duration);
    for (const [name, tr] of this.tracks) {
      tr.current.slerpQuaternions(tr.from, tr.to, t);
      this.vrm.humanoid.getNormalizedBoneNode(name)?.quaternion.copy(tr.current);
    }
  }

  get isTransitioning(): boolean {
    return this.elapsed < this.duration;
  }
}
