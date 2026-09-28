/**
 * Character: VRM 하나에 대한 연출 묶음 (포즈 + 표정 + idle + 립싱크).
 * 계산기 이벤트를 받아 reactions.json에 따라 포즈를 고른다.
 */
import type { VRM } from '@pixiv/three-vrm';
import type { MouthKey } from '../voice/plan';
import { ExpressionAnimator } from './expression';
import { IdleLayer } from './idle';
import { LipSync } from './lipsync';
import { POSES, REACTIONS, type PoseDef } from './pose';
import { PoseAnimator } from './poseAnimator';

export type ReactionKey =
  | 'digit'
  | 'operator'
  | 'function'
  | 'equals'
  | 'clear'
  | 'error'
  | 'modifier'
  | 'menu'
  | 'memory';

export class Character {
  readonly pose: PoseAnimator;
  readonly expression: ExpressionAnimator;
  readonly idle: IdleLayer;
  readonly lipSync: LipSync;
  private lastPoseId = '';
  private holdTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly vrm: VRM) {
    this.pose = new PoseAnimator(vrm);
    this.expression = new ExpressionAnimator(vrm);
    this.idle = new IdleLayer(vrm);
    this.lipSync = new LipSync(vrm);
  }

  react(key: ReactionKey): void {
    const group = REACTIONS.groups[key];
    if (!group || group.poses.length === 0) return;

    // 풀에서 직전 포즈를 빼고 랜덤 선택 → 같은 키를 연타해도 움직임이 바뀐다
    const pool = group.poses.length > 1 ? group.poses.filter((p) => p !== this.lastPoseId) : group.poses;
    const id = pool[Math.floor(Math.random() * pool.length)];
    const pose = POSES[id];
    if (!pose) return;
    this.apply(pose);

    clearTimeout(this.holdTimer);
    if (group.hold) this.holdTimer = setTimeout(() => this.apply(POSES[REACTIONS.idle]), group.hold);
  }

  speak(keys: MouthKey[], startAt: number, now: () => number): void {
    this.lipSync.play(keys, startAt, now);
  }

  private apply(pose: PoseDef): void {
    this.lastPoseId = pose.id;
    this.pose.play(pose);
    this.expression.play(pose.expression, pose.duration);
  }

  update(dt: number): void {
    this.pose.update(dt); // 1) 기본 회전 쓰기
    this.idle.update(dt); // 2) 그 위에 호흡 등을 곱하기
    this.expression.update(dt);
    this.lipSync.update(dt); // 입 모양은 감정 표정과 별개 채널
    this.vrm.update(dt); // 3) 정규화 본 → 실제 본, 스프링본(머리카락), 시선, 표정 반영
  }

  dispose(): void {
    clearTimeout(this.holdTimer);
  }
}
