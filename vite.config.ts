/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { resolve, join, relative, sep } from 'node:path';
import { existsSync, readdirSync, statSync, createReadStream } from 'node:fs';

const ASSET_DIR = resolve(import.meta.dirname, 'assets');
const PREFIX = '/__local-assets/';

/**
 * 개발 전용: 로컬 `assets/` 폴더를 `/__local-assets/*` 로 서빙한다.
 *
 * `apply: 'serve'` 이므로 `vite build` 에는 이 플러그인이 존재하지 않는다.
 * 즉 배포판에서는 이 경로가 404가 되고, 앱은 사용자 파일 선택으로 넘어간다.
 * assets/ 는 public/ 밖에 있으므로 빌드 결과물에 복사될 경로도 없다.
 */
function localAssets(): Plugin {
  return {
    name: 'rei-local-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) return next();
        const rel = decodeURIComponent(req.url.slice(PREFIX.length).split('?')[0]);

        if (rel === 'manifest.json') {
          const files = existsSync(ASSET_DIR) ? walk(ASSET_DIR) : [];
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files }));
          return;
        }

        const abs = resolve(ASSET_DIR, rel);
        // 경로 탈출(../) 방지
        if (!abs.startsWith(ASSET_DIR + sep) || !existsSync(abs) || !statSync(abs).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        createReadStream(abs).pipe(res);
      });
    },
  };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(relative(ASSET_DIR, p).split(sep).join('/'));
  }
  return out;
}

export default defineConfig({
  plugins: [localAssets()],
  build: {
    rollupOptions: {
      // 포즈 에디터는 개발 도구이므로 프로덕션 빌드에 넣지 않는다.
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
