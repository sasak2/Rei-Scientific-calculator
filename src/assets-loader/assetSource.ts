/**
 * 에셋 공급원.
 *
 * 라이선스상 모델과 음원은 재배포할 수 없으므로 앱에 포함하지 않는다.
 *   - 개발 중: vite.config.ts의 dev 전용 미들웨어가 로컬 assets/ 폴더를 /__local-assets/ 로 서빙
 *   - 배포판: 사용자가 파일 선택 / 드래그 앤 드롭으로 자신의 파일을 불러온다.
 *     파일은 브라우저 메모리(Blob URL)에서만 쓰이고 어디에도 업로드되지 않는다.
 */

export interface VoiceFiles {
  /** 음원 폴더 기준 상대 경로 → File */
  files: Map<string, File>;
}

export interface DevAssets {
  modelUrl: string | null;
  /** assets/ 기준 oto.ini 경로 (예: voice/oto.ini) */
  otoPath: string | null;
}

/** 개발 서버에서 assets/ 파일을 읽는 URL 접두어 */
export const DEV_ASSET_BASE = '/__local-assets/';

/** 개발 서버에서만 로컬 assets/ 목록을 가져온다. 프로덕션 빌드에서는 코드째 제거된다. */
export async function loadDevAssets(): Promise<DevAssets | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const res = await fetch('/__local-assets/manifest.json');
    if (!res.ok) return null;
    const { files } = (await res.json()) as { files: string[] };
    const model = files.find((f) => f.toLowerCase().endsWith('.vrm'));
    // 이름이 정확히 oto.ini 인 것 중 가장 얕은 경로 (tmp-…-oto.ini 같은 백업 파일 제외)
    const oto = files
      .filter((f) => f.split('/').pop()!.toLowerCase() === 'oto.ini')
      .sort((a, b) => a.split('/').length - b.split('/').length)[0];
    return {
      modelUrl: model ? `/__local-assets/${model.split('/').map(encodeURIComponent).join('/')}` : null,
      otoPath: oto ?? null,
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ 사용자 파일

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function pickDirectory(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** 파일 목록에서 음원(oto.ini가 있는 폴더)을 추려 낸다 */
export function collectVoice(files: File[]): VoiceFiles | null {
  const rel = (f: File) => (f as File & { relPath?: string }).relPath || f.webkitRelativePath || f.name;
  // 하위 폴더에 샘플용 oto.ini가 더 있을 수 있으므로 가장 얕은 것을 고른다
  const oto = files
    .filter((f) => f.name.toLowerCase() === 'oto.ini')
    .sort((a, b) => rel(a).split('/').length - rel(b).split('/').length)[0];
  if (!oto) return null;
  const otoPath = rel(oto);
  const base = otoPath.slice(0, otoPath.length - oto.name.length);
  const map = new Map<string, File>();
  for (const f of files) {
    const p = rel(f);
    if (p.startsWith(base) && /\.(wav|ini)$/i.test(f.name)) map.set(p.slice(base.length), f);
  }
  return { files: map };
}

/**
 * 드래그 앤 드롭: 파일과 폴더를 모두 받는다.
 * 폴더는 DataTransferItem.webkitGetAsEntry()로 재귀 순회해야 안의 파일이 보인다.
 */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return [...dt.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, path: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      Object.defineProperty(file, 'relPath', { value: path + file.name });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries는 한 번에 최대 100개 정도만 주므로 빈 배열이 나올 때까지 반복
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const e of batch) await walk(e, `${path}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}
