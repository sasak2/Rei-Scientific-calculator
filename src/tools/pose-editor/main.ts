/**
 * 포즈 에디터 (개발 전용 페이지, 프로덕션 빌드에 포함되지 않음).
 * 본마다 X/Y/Z 슬라이더로 각도를 조절하고, 결과를 포즈 JSON으로 내보낸다.
 * 모델 파일은 건드리지 않고 런타임 회전값만 바꾼다.
 */
import GUI from 'lil-gui';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import { loadDevAssets, pickFile } from '../../assets-loader/assetSource';
import { EMOTIONS } from '../../character/expression';
import { EASINGS, eulerDegToQuat, isVRM0, POSES, type EasingName, type PoseDef, type Vec3 } from '../../character/pose';
import { Stage } from '../../character/stage';

const GUI_WIDTH = 320;

const BONE_GROUPS: Record<string, VRMHumanBoneName[]> = {
  몸통: ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'],
  '왼팔 (캐릭터 기준)': ['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'],
  '오른팔 (캐릭터 기준)': ['rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
  다리: ['leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'],
};
const ALL_BONES = Object.values(BONE_GROUPS).flat();

const stage = new Stage(document.querySelector<HTMLCanvasElement>('#stage')!, {
  sideLayout: () => true,
  freeRect: () => ({ x: 0, y: 0, w: window.innerWidth - GUI_WIDTH, h: window.innerHeight }),
});

// ------------------------------------------------------------------ 편집 상태

type BoneAngles = { x: number; y: number; z: number };
const state = {
  id: 'new_pose',
  note: '',
  duration: 220,
  easing: 'easeOutCubic' as EasingName,
  bones: Object.fromEntries(ALL_BONES.map((b) => [b, { x: 0, y: 0, z: 0 }])) as Record<VRMHumanBoneName, BoneAngles>,
  expression: Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Record<string, number>,
  base: 'rest',
};

function loadPose(id: string): void {
  const rest = POSES.rest;
  const pose = POSES[id];
  if (!pose) return;
  state.id = id === 'rest' ? 'rest' : `${id}`;
  state.note = pose.note ?? '';
  state.duration = pose.duration ?? 220;
  state.easing = pose.easing ?? 'easeOutCubic';
  for (const b of ALL_BONES) {
    // 런타임과 같은 규칙: 포즈에 없는 본은 rest 값
    const v = pose.bones[b] ?? rest.bones[b] ?? [0, 0, 0];
    Object.assign(state.bones[b], { x: v[0], y: v[1], z: v[2] });
  }
  for (const e of EMOTIONS) state.expression[e] = pose.expression?.[e] ?? 0;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

function toPoseDef(): PoseDef {
  const rest = POSES.rest;
  const bones: PoseDef['bones'] = {};
  for (const b of ALL_BONES) {
    const { x, y, z } = state.bones[b];
    const v: Vec3 = [round(x), round(y), round(z)];
    const r = rest.bones[b] ?? [0, 0, 0];
    const differs = v.some((a, i) => a !== r[i]);
    // rest 자체를 편집할 때는 0이 아닌 본, 그 외에는 rest와 다른 본만 내보낸다
    if (state.id === 'rest' ? v.some((a) => a !== 0) : differs) bones[b] = v;
  }
  const expression = Object.fromEntries(Object.entries(state.expression).filter(([, w]) => w > 0).map(([k, w]) => [k, round(w, 2)]));
  return {
    id: state.id,
    ...(state.note ? { note: state.note } : {}),
    bones,
    expression,
    duration: state.duration,
    easing: state.easing,
  };
}

const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

// ------------------------------------------------------------------ 매 프레임 적용

let previewUntil = 0;
stage.onFrame = (dt) => {
  const ch = stage.character;
  if (!ch) return;
  if (performance.now() < previewUntil) {
    ch.update(dt); // 보간 미리보기: 실제 앱과 같은 경로
    return;
  }
  const vrm0 = isVRM0(ch.vrm);
  for (const b of ALL_BONES) {
    const node = ch.vrm.humanoid.getNormalizedBoneNode(b);
    if (!node) continue;
    const { x, y, z } = state.bones[b];
    eulerDegToQuat([x, y, z], vrm0, node.quaternion);
  }
  const mgr = ch.vrm.expressionManager;
  for (const [e, w] of Object.entries(state.expression)) if (mgr?.getExpression(e)) mgr.setValue(e, w);
  ch.vrm.update(dt);
};

// ------------------------------------------------------------------ GUI

const gui = new GUI({ title: 'Rei Pose Editor', width: GUI_WIDTH });
const actions = {
  async loadModel() {
    const f = await pickFile('.vrm');
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      await stage.loadVRM(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
  resetToRest() {
    loadPose('rest');
    state.id = 'new_pose';
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
  zeroAll() {
    for (const b of ALL_BONES) Object.assign(state.bones[b], { x: 0, y: 0, z: 0 });
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
  preview() {
    const ch = stage.character;
    if (!ch) return;
    const pose = toPoseDef();
    ch.pose.set(POSES[state.base] ?? POSES.rest);
    ch.pose.play(pose);
    ch.expression.play(pose.expression, pose.duration);
    previewUntil = performance.now() + (pose.duration ?? 220) + 600;
  },
  async copyJson() {
    const json = JSON.stringify(toPoseDef(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      alert('클립보드에 복사했습니다');
    } catch {
      console.log(json);
      alert('클립보드 복사 실패: 콘솔에 출력했습니다');
    }
  },
  downloadJson() {
    const blob = new Blob([JSON.stringify(toPoseDef(), null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  pose: 'rest',
};

gui.add(actions, 'loadModel').name('모델 불러오기 (.vrm)');
gui.add(actions, 'pose', Object.keys(POSES)).name('기존 포즈 열기').onChange(loadPose);
gui.add(state, 'id').name('포즈 id');
gui.add(state, 'note').name('메모');

const anim = gui.addFolder('전환');
anim.add(state, 'duration', 50, 800, 10).name('시간 (ms)');
anim.add(state, 'easing', Object.keys(EASINGS)).name('이징');
anim.add(state, 'base', Object.keys(POSES)).name('미리보기 시작 포즈');
anim.add(actions, 'preview').name('▶ 보간 미리보기');

for (const [group, bones] of Object.entries(BONE_GROUPS)) {
  const folder = gui.addFolder(group);
  if (group.startsWith('다리')) folder.close();
  for (const b of bones) {
    const sub = folder.addFolder(b);
    sub.add(state.bones[b], 'x', -180, 180, 1);
    sub.add(state.bones[b], 'y', -180, 180, 1);
    sub.add(state.bones[b], 'z', -180, 180, 1);
    if (!['head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'].includes(b)) sub.close();
  }
}

const expr = gui.addFolder('표정');
for (const e of EMOTIONS) expr.add(state.expression, e, 0, 1, 0.05);

const out = gui.addFolder('내보내기');
out.add(actions, 'resetToRest').name('rest로 초기화');
out.add(actions, 'zeroAll').name('모든 본 0 (T포즈)');
out.add(actions, 'copyJson').name('JSON 복사');
out.add(actions, 'downloadJson').name('JSON 다운로드');

actions.resetToRest();

loadDevAssets().then((dev) => {
  if (dev?.modelUrl) void stage.loadVRM(dev.modelUrl);
});
