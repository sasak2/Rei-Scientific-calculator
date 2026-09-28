/** 사용자 설정 (이 브라우저의 localStorage에만 저장). 저장소를 못 쓰는 환경에서도 기본값으로 동작한다. */
export interface Settings {
  folded: boolean;
  muted: boolean;
  effects: boolean;
  quality: 1 | 1.5 | 2;
}

const KEY = 'rei-calc:settings';
const DEFAULTS: Settings = { folded: false, muted: false, effects: true, quality: 1.5 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 사생활 보호 모드 등: 저장만 건너뛴다 */
  }
}
