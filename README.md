# Rei Calculator

UTAU 캐릭터 **아다치 레이**를 테마로 한 CASIO fx-991ES PLUS 재현 공학용 계산기입니다 (비상업 팬 메이드).

캐릭터, 모델, 음원 © Mechanical Girl (みさいる), https://mechanicalgirl.jp/

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 계산 엔진 단위 테스트 (Vitest)
npm run build        # 타입 검사 → 빌드 → dist에 모델/음원이 없는지 검사
```

포즈 에디터(개발 전용): http://localhost:5173/pose-editor.html

## 에셋 (라이선스 주의)

모델과 음원은 재배포와 개조가 금지되어 있으므로 저장소와 빌드 결과물에 **절대 포함하지 않습니다**.

- 개발: `assets/model.vrm`, `assets/voice/oto.ini` + wav를 두면 dev 서버가 자동으로 불러옵니다. `assets/`는 `.gitignore` 대상입니다.
- 배포판: 사용자가 우측 📂 버튼이나 드래그 앤 드롭으로 자기 파일을 불러옵니다. 파일은 브라우저 안에서만 쓰고 업로드하지 않습니다.
- `npm run build`는 `scripts/check-dist.mjs`로 dist에 `.vrm`, `.wav`, `.ini` 등이 섞여 있으면 실패합니다.

## 구조

| 폴더 | 역할 |
|---|---|
| `src/engine/` | 순수 TS 계산 엔진 (DOM 의존 없음): 입력 트리 → 토크나이저 → Pratt 파서 → AST → 평가기, 하이브리드 수치(BigInt 유리수 + 15자리 double) |
| `src/ui/` | 디스플레이, 키패드(배치는 `keypad/layout.ts` 데이터), 배경 이펙트 |
| `src/character/` | three.js + three-vrm 스테이지, 포즈 slerp 보간, 표정, 호흡/깜빡임. 포즈는 `poses/*.json`, 반응은 `reactions.json` |
| `src/voice/` | UTAU 음성: oto.ini 파서, 모라 분할, 일본어 수사 읽기, 조각 연결 계획, Web Audio 재생. 읽는 말은 `reading.ts` 표에서 바꾼다 |
| `src/assets-loader/` | dev 자동 로드 / 파일 선택 / 드래그 앤 드롭 |
| `src/styles/theme.css` | 색 테마 CSS 변수 |

### 포즈 추가하기
1. 포즈 에디터에서 슬라이더로 자세를 만들고 **JSON 다운로드**를 누릅니다.
2. 받은 파일을 `src/character/poses/`에 넣습니다.
3. `src/character/reactions.json`의 원하는 그룹(digit, operator, equals, error …)에 id를 추가합니다.

각도는 VRM 1.0 정규화 본 기준(도, XYZ)입니다. VRM 0.x 모델에는 코드가 자동으로 변환해서 적용합니다.
