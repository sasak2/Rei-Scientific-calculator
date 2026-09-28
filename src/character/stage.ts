/**
 * Stage: three.js 렌더러, 카메라, 조명, VRM 로드를 담당한다.
 * 캔버스는 투명(alpha)이라 뒤의 CSS 그라데이션과 사인파 캔버스가 비쳐 보인다.
 */
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { Character } from './character';

export interface StageOptions {
  /** 데스크톱 가로 레이아웃에서 모델을 왼쪽으로 치우칠지 */
  sideLayout: () => boolean;
  /** UI에 가려지지 않는 영역 (CSS px). 캐릭터를 이 영역 가운데에 둔다 */
  freeRect?: () => { x: number; y: number; w: number; h: number };
  maxPixelRatio?: number;
}

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.1, 20);
  character: Character | null = null;
  /** 매 프레임 호출 (포즈 에디터가 캐릭터 연출 대신 직접 제어할 때 사용) */
  onFrame: ((dt: number) => void) | null = null;

  private readonly clock = new Clock();
  private headY = 1.35;
  private maxPixelRatio: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: StageOptions,
  ) {
    this.maxPixelRatio = opts.maxPixelRatio ?? 2;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    // MToon은 조명 영향을 적게 받지만, 방향광이 있어야 그림자 경계(툰 셰이딩)가 생긴다
    const key = new DirectionalLight(0xffffff, Math.PI * 0.9);
    key.position.set(0.6, 1.4, 1.6);
    const rim = new DirectionalLight(0xffa060, Math.PI * 0.35); // 주황 림라이트 (테마색)
    rim.position.set(-1.2, 1.2, -1.4);
    this.scene.add(key, rim, new AmbientLight(0xffffff, 0.4));

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  async loadVRM(url: string): Promise<VRM> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('VRM 데이터가 없는 파일입니다');

    this.unload();
    // VRM 0.x는 -Z를 바라보므로 1.0과 같은 +Z 방향으로 돌린다 (씬 그래프 회전일 뿐 파일은 그대로)
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => (o.frustumCulled = false)); // 스킨 메시가 카메라 가까이서 잘리는 문제 방지
    if (vrm.lookAt) vrm.lookAt.target = this.camera; // 카메라(=사용자)를 바라봄

    this.scene.add(vrm.scene);
    this.character = new Character(vrm);
    this.character.update(0);

    vrm.scene.updateMatrixWorld(true);
    const head = vrm.humanoid.getRawBoneNode('head');
    if (head) this.headY = head.getWorldPosition(new Vector3()).y;
    this.frame();
    return vrm;
  }

  unload(): void {
    if (!this.character) return;
    this.character.dispose();
    this.scene.remove(this.character.vrm.scene);
    VRMUtils.deepDispose(this.character.vrm.scene);
    this.character = null;
    this.renderer.clear();
  }

  setMaxPixelRatio(r: number): void {
    this.maxPixelRatio = r;
    this.resize();
  }

  /** UI 배치가 바뀌었을 때(접기 등) 구도 다시 계산 */
  reframe(): void {
    this.frame();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frame();
  }

  /**
   * 상반신 구도: UI에 가려지지 않는 빈 영역(freeRect) 한가운데에 캐릭터가 오도록 맞춘다.
   *
   * 1) 거리: 보여 줄 세로 범위(span, 미터)가 빈 영역 높이의 90%를 채우도록 역산한다.
   *    원근 카메라에서 거리 d일 때 화면 전체 높이에 보이는 세계 높이는 H = 2·d·tan(fov/2).
   *    span이 차지할 화면 비율을 k = 0.9·rectH / h 로 두면  H = span / k  →  d = H / (2·tan(fov/2)).
   * 2) 위치: setViewOffset으로 투영 중심을 빈 영역 중심으로 옮긴다 (렌즈 시프트와 같은 원리라
   *    카메라를 돌리지 않으므로 캐릭터가 비스듬히 보이지 않는다).
   */
  private frame(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const side = this.opts.sideLayout();
    const rect = this.opts.freeRect?.() ?? { x: 0, y: 0, w, h: h * 0.35 };
    const rectH = Math.max(rect.h, h * 0.25); // 너무 좁으면 반투명 디스플레이 뒤로 조금 겹쳐도 됨

    const span = side ? 1.1 : 0.5; // 세로 화면은 머리~어깨, 가로 화면은 허리 위까지
    // headY는 head 본(목 위 관절) 높이. 얼굴 중심은 그보다 약간 위
    const centerY = side ? this.headY - 0.25 : this.headY + 0.02;
    const H = span / ((0.9 * rectH) / h);
    const dist = MathUtils.clamp(H / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2))), 0.9, 3.2);

    this.camera.position.set(0, centerY, dist);
    this.camera.lookAt(0, centerY, 0);
    const xOff = w / 2 - (rect.x + rect.w / 2);
    const yOff = h / 2 - (rect.y + Math.min(rect.h, rectH) / 2);
    this.camera.setViewOffset(w, h, xOff, yOff, w, h);
    this.camera.updateProjectionMatrix();
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1); // 탭 전환 후 큰 dt로 튀는 것 방지
    if (!this.character) return;
    if (this.onFrame) this.onFrame(dt);
    else this.character.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
