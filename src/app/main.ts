/**
 * 앱 조립: 엔진 ↔ UI ↔ 캐릭터를 이벤트로 연결한다.
 *
 *   Keypad/키보드 ─press(key)→ Calculator ─events→ ┬ Display.render
 *                                                   ├ Character.react (모델이 있을 때만)
 *                                                   └ WaveBackground.pulse
 * 캐릭터와 음성은 엔진을 모르고 이벤트만 받으므로, 모델이 없어도 계산기는 그대로 동작한다.
 */
import '../styles/fonts.css';
import '../styles/theme.css';
import '../styles/base.css';

import { collectVoice, filesFromDrop, loadDevAssets, pickDirectory, pickFile, type VoiceFiles } from '../assets-loader/assetSource';
import type { ReactionKey } from '../character/character';
import { Stage } from '../character/stage';
import { Calculator, type CalcEvent } from '../engine/calculator';
import type { PhysicalKey } from '../engine/keys';
import { Display } from '../ui/display/display';
import { WaveBackground } from '../ui/effects/waveBackground';
import { Keypad } from '../ui/keypad/keypad';
import { KEYBOARD_MAP } from '../ui/keypad/layout';
import { loadSettings, saveSettings } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const app = $('#app');
const settings = loadSettings();
const calc = new Calculator();
const display = new Display($('#display'));
const wave = new WaveBackground($<HTMLCanvasElement>('#wave-bg'));
const isSideLayout = () => window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches;

let stage: Stage | null = null;
try {
  stage = new Stage($<HTMLCanvasElement>('#stage'), {
    sideLayout: isSideLayout,
    freeRect: () => {
      const ui = $('#ui').getBoundingClientRect();
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 가로 레이아웃: UI 왼쪽 전체 / 세로 레이아웃: UI 위쪽 전체
      return isSideLayout() ? { x: 0, y: 0, w: ui.left, h } : { x: 0, y: 0, w, h: ui.top };
    },
    maxPixelRatio: settings.quality,
  });
} catch (e) {
  // WebGL을 쓸 수 없는 환경에서도 계산기는 동작해야 한다
  console.warn('WebGL 초기화 실패: 캐릭터 없이 동작합니다', e);
}
let voice: VoiceFiles | null = null;

// ------------------------------------------------------------------ 키 입력

const keypad = new Keypad($('#keypad'), {
  onKey: press,
  onFoldChange(folded) {
    updateLayout();
    settings.folded = folded;
    saveSettings(settings);
  },
});
keypad.setFolded(settings.folded);
updateLayout();

/** UI 위 빈 공간 높이를 CSS에 알리고(보조 버튼 배치) 카메라 구도를 다시 맞춘다 */
function updateLayout(): void {
  document.documentElement.style.setProperty('--free-top', `${$('#ui').getBoundingClientRect().top}px`);
  stage?.reframe();
}
window.addEventListener('resize', updateLayout);

function press(key: PhysicalKey): void {
  const events = calc.press(key);
  display.render(calc);
  for (const ev of events) handle(ev);
}

function handle(ev: CalcEvent): void {
  switch (ev.type) {
    case 'input':
      wave.pulse(0.35);
      if (ev.category !== 'control') react(ev.category);
      break;
    case 'result':
      wave.pulse(1);
      react('equals');
      break;
    case 'error':
      wave.pulse(0.6);
      react('error');
      break;
    case 'clear':
      react('clear');
      break;
    case 'modifier':
      keypad.setLayer(ev.shift, ev.alpha);
      break;
    case 'unimplemented': {
      const label = keypad.labelOf(ev.key, ev.layer);
      const prefix = ev.layer === 'shift' ? 'SHIFT ' : ev.layer === 'alpha' ? 'ALPHA ' : '';
      toast(`${prefix}${label}: 다음 단계에서 구현 예정`);
      break;
    }
  }
}

function react(key: ReactionKey): void {
  stage?.character?.react(key);
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const key = KEYBOARD_MAP[e.key];
  if (!key) return;
  e.preventDefault();
  keypad.flash(key);
  press(key);
});

display.render(calc);

// ------------------------------------------------------------------ 토스트

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string): void {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ------------------------------------------------------------------ 모델 / 음원

async function loadModel(url: string, label: string): Promise<void> {
  if (!stage) {
    toast('이 브라우저에서는 3D(WebGL)를 쓸 수 없습니다');
    return;
  }
  const status = $('#status-model');
  status.textContent = '불러오는 중…';
  status.classList.remove('ok');
  try {
    await stage.loadVRM(url);
    app.classList.add('has-model');
    status.textContent = label;
    status.classList.add('ok');
  } catch (e) {
    console.error(e);
    status.textContent = '불러오기 실패';
    toast('VRM 파일을 읽지 못했습니다');
  }
}

async function loadModelFile(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    await loadModel(url, file.name);
  } finally {
    URL.revokeObjectURL(url); // 파싱이 끝나면 Blob URL은 필요 없다
  }
}

function setVoice(v: VoiceFiles | null): void {
  voice = v;
  const status = $('#status-voice');
  status.textContent = v ? `oto.ini + wav ${[...v.files.keys()].filter((f) => /\.wav$/i.test(f)).length}개` : '없음';
  status.classList.toggle('ok', !!v);
}

$('#load-model').addEventListener('click', async () => {
  const f = await pickFile('.vrm');
  if (f) await loadModelFile(f);
});
$('#load-voice').addEventListener('click', async () => {
  const files = await pickDirectory();
  if (files.length === 0) return;
  const v = collectVoice(files);
  if (!v) toast('폴더에서 oto.ini를 찾지 못했습니다');
  else setVoice(v);
});

// 드래그 앤 드롭 (파일/폴더)
let dragDepth = 0;
const overlay = $('#drop-overlay');
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    overlay.hidden = true;
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  if (!e.dataTransfer) return;
  const files = await filesFromDrop(e.dataTransfer);
  const vrm = files.find((f) => f.name.toLowerCase().endsWith('.vrm'));
  if (vrm) await loadModelFile(vrm);
  const v = collectVoice(files);
  if (v) {
    setVoice(v);
    toast('음원 폴더를 인식했습니다 (음성은 다음 단계에서 재생)');
  }
  if (!vrm && !v) toast('.vrm 파일이나 oto.ini가 있는 폴더를 놓아 주세요');
});

// 개발 서버: 로컬 assets/ 자동 로드
loadDevAssets().then((dev) => {
  if (!dev) return;
  if (dev.modelUrl) void loadModel(dev.modelUrl, `${decodeURIComponent(dev.modelUrl.split('/').pop()!)} (dev)`);
  if (dev.voicePaths.length) $('#status-voice').textContent = `assets/ 에 ${dev.voicePaths.length}개 파일 (dev)`;
});

// ------------------------------------------------------------------ 보조 버튼 / 설정

$('#btn-hide').addEventListener('click', () => app.classList.toggle('ui-hidden'));

const muteBtn = $('#btn-mute');
const applyMute = () => muteBtn.setAttribute('aria-pressed', String(settings.muted));
applyMute();
muteBtn.addEventListener('click', () => {
  settings.muted = !settings.muted;
  applyMute();
  saveSettings(settings);
});

const openDialog = (id: string) => $<HTMLDialogElement>(id).showModal();
$('#btn-load').addEventListener('click', () => openDialog('#dlg-load'));
$('#btn-info').addEventListener('click', () => openDialog('#dlg-info'));
$('#btn-settings').addEventListener('click', () => openDialog('#dlg-settings'));

const effectsBox = $<HTMLInputElement>('#set-effects');
const qualitySel = $<HTMLSelectElement>('#set-quality');
effectsBox.checked = settings.effects;
qualitySel.value = String(settings.quality);
wave.setEnabled(settings.effects);
effectsBox.addEventListener('change', () => {
  settings.effects = effectsBox.checked;
  wave.setEnabled(settings.effects);
  saveSettings(settings);
});
qualitySel.addEventListener('change', () => {
  settings.quality = Number(qualitySel.value) as 1 | 1.5 | 2;
  stage?.setMaxPixelRatio(settings.quality);
  saveSettings(settings);
});

// 다음 단계(음성)에서 사용
void voice;

// 개발 중 콘솔 디버깅용 (프로덕션 빌드에서는 제거됨)
if (import.meta.env.DEV) Object.assign(window, { __rei: { calc, stage } });
