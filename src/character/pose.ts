/**
 * 포즈 데이터 형식과 라이브러리.
 *
 * 포즈 JSON의 회전값은 VRM "정규화(normalized) 휴머노이드 본" 공간의 오일러 각(도, XYZ 순서)이다.
 * three-vrm의 정규화 본은 T포즈를 항등 회전(0,0,0)으로 두고 축을 월드에 맞춰 두었기 때문에,
 * 같은 JSON이 어떤 VRM 모델에도 같은 의미로 적용된다.
 *
 * 축 규칙 (VRM 1.0 좌표계: 캐릭터가 +Z를 바라보고, +X가 캐릭터의 왼쪽, +Y가 위):
 *   - leftUpperArm z가 음수면 왼팔이 내려감, rightUpperArm z가 양수면 오른팔이 내려감
 *   - leftLowerArm y가 음수 / rightLowerArm y가 양수면 팔꿈치가 앞으로 굽음
 *   - head x가 양수면 고개를 숙임, y가 양수면 캐릭터 왼쪽을 봄, z는 갸웃
 *
 * VRM 0.x 모델은 모델 좌표계가 -Z를 바라본다(1.0과 Y축으로 180° 돌아간 관계).
 * rotateVRM0()은 씬 전체를 돌려 화면상 방향만 맞출 뿐, 정규화 본의 로컬 축은 그대로다.
 * 그래서 같은 회전을 0.x 모델에 주려면 Y축 180° 켤레 변환이 필요하다:
 *   q' = R_y(π) · q · R_y(π)⁻¹  →  (x, y, z, w) ↦ (-x, y, -z, w)
 * 즉 X, Z축 회전의 부호만 뒤집으면 된다. 포즈 JSON은 항상 1.0 기준으로 작성한다.
 */
import { Euler, MathUtils, Quaternion } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import reactionsJson from './reactions.json';

export type Vec3 = [number, number, number];
export type EasingName = 'linear' | 'easeOutCubic' | 'easeInOutCubic';

export interface PoseDef {
  id: string;
  note?: string;
  bones: Partial<Record<VRMHumanBoneName, Vec3>>;
  expression?: Record<string, number>;
  duration?: number;
  easing?: EasingName;
}

export interface ReactionGroup {
  poses: string[];
  hold?: number;
}

export interface Reactions {
  idle: string;
  groups: Record<string, ReactionGroup>;
}

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
};

// poses/ 폴더의 JSON을 빌드 시점에 전부 모은다. 새 포즈는 파일만 추가하면 된다.
const modules = import.meta.glob<PoseDef>('./poses/*.json', { eager: true, import: 'default' });

export const POSES: Record<string, PoseDef> = Object.fromEntries(
  Object.values(modules).map((p) => [p.id, p]),
);

export const REACTIONS: Reactions = reactionsJson as Reactions;

/** 모든 포즈에 한 번이라도 등장하는 본 = 애니메이터가 관리할 본 목록 */
export function trackedBones(poses: Iterable<PoseDef> = Object.values(POSES)): VRMHumanBoneName[] {
  const set = new Set<VRMHumanBoneName>();
  for (const p of poses) for (const b of Object.keys(p.bones)) set.add(b as VRMHumanBoneName);
  return [...set];
}

const _euler = new Euler();

export function eulerDegToQuat(v: Vec3, vrm0 = false, out = new Quaternion()): Quaternion {
  _euler.set(MathUtils.degToRad(v[0]), MathUtils.degToRad(v[1]), MathUtils.degToRad(v[2]), 'XYZ');
  out.setFromEuler(_euler);
  return vrm0 ? toVRM0(out) : out;
}

/** VRM 1.0 기준 회전을 0.x 모델의 정규화 본 공간으로 (자기 자신의 역변환이기도 하다) */
export function toVRM0(q: Quaternion): Quaternion {
  return q.set(-q.x, q.y, -q.z, q.w);
}

export function isVRM0(vrm: VRM): boolean {
  return vrm.meta?.metaVersion === '0';
}
