// 빌드 결과물에 라이선스 보호 대상(모델/음원)이 섞여 들어가지 않았는지 검사한다.
// 하나라도 발견되면 exit 1 → `npm run build`가 실패한다.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const FORBIDDEN = /\.(vrm|wav|frq|ini|llsm|mrq)$/i;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const bad = walk(DIST).filter((p) => FORBIDDEN.test(p));
if (bad.length) {
  console.error('\n[check-dist] 빌드 결과물에 배포 금지 에셋이 있습니다:');
  for (const p of bad) console.error('  - ' + relative(DIST, p));
  process.exit(1);
}
console.log(`[check-dist] OK — dist에 모델/음원 파일 없음 (${walk(DIST).length}개 파일 검사)`);
