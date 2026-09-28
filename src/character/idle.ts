/**
 * 대기 동작 레이어: 포즈 위에 "덧붙이는" 미세한 움직임.
 *
 * - 호흡: 약 0.25Hz(4초 주기) 사인파로 가슴/척추를 아주 조금 앞뒤로 기울인다.
 *   PoseAnimator가 매 프레임 기본 회전을 먼저 쓰고, 여기서 작은 회전을 곱한다(q = q_pose · q_breath).
 *   곱하는 순서가 오른쪽이므로 "본 자신의 로컬 축" 기준 회전이 된다.
 * - 고개 흔들림: 서로 다른 주기의 사인 두 개를 더해 반복이 티 나지 않게 한다.
 * - 눈 깜빡임: 2~6초 랜덤 간격, 닫기 60ms + 열기 90ms. 가끔 두 번 연속으로 깜빡인다.
 */
import { Euler, Quaternion } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { isVRM0, toVRM0 } from './pose';

const DEG = Math.PI / 180;
const _q = new Quaternion();
const _e = new Euler();

export class IdleLayer {
  private t = 0;
  private nextBlink = 2 + Math.random() * 3;
  private blinkT = -1;
  private doubleBlink = false;
  enabled = true;
  private readonly vrm0: boolean;

  constructor(private readonly vrm: VRM) {
    this.vrm0 = isVRM0(vrm);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.t += dt;
    const breath = Math.sin(this.t * 2 * Math.PI * 0.25);

    this.rotate('chest', breath * 1.2, 0, 0);
    this.rotate('spine', breath * 0.6, 0, 0);
    this.rotate(
      'head',
      Math.sin(this.t * 0.7) * 0.8,
      Math.sin(this.t * 0.43 + 1) * 1.2,
      Math.sin(this.t * 0.31 + 2) * 0.8,
    );
    this.updateBlink(dt);
  }

  private rotate(bone: 'chest' | 'spine' | 'head', xDeg: number, yDeg: number, zDeg: number): void {
    const node = this.vrm.humanoid.getNormalizedBoneNode(bone);
    if (!node) return;
    _q.setFromEuler(_e.set(xDeg * DEG, yDeg * DEG, zDeg * DEG));
    if (this.vrm0) toVRM0(_q);
    node.quaternion.multiply(_q);
  }

  private updateBlink(dt: number): void {
    const mgr = this.vrm.expressionManager;
    if (!mgr?.getExpression('blink')) return;

    if (this.blinkT < 0) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkT = 0;
        this.doubleBlink = Math.random() < 0.15;
      }
      return;
    }
    this.blinkT += dt;
    const CLOSE = 0.06;
    const OPEN = 0.09;
    let w: number;
    if (this.blinkT < CLOSE) w = this.blinkT / CLOSE;
    else if (this.blinkT < CLOSE + OPEN) w = 1 - (this.blinkT - CLOSE) / OPEN;
    else {
      w = 0;
      this.blinkT = -1;
      this.nextBlink = this.doubleBlink ? 0.12 : 2 + Math.random() * 4;
      this.doubleBlink = false;
    }
    mgr.setValue('blink', w);
  }
}
