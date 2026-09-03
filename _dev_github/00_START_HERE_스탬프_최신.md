# 🔖 START_HERE 스탬프 — 항상 이 파일이 최신 (2026-09-03)

> **왜 따로 있나**: `00_START_HERE_개발현황.md`는 23KB다. 세션마다 스탬프 한 줄 바꾸자고 통째로 다시 쓰면
> 읽기+쓰기로 매번 1만 토큰 넘게 든다(L34). 그래서 **자주 바뀌는 부분만** 이 작은 파일로 뗐다.
> START_HERE 본문(지도·불변 규칙·구조 설명)은 그대로 두고 **스탬프는 여기를 본다.**

## 현재 상태 (2026-09-03)

> ⚠️ **v1.4.47은 빌드·검증까지만 끝났고 배포는 안 했다.** 라이브는 아직 **v1.4.46**이다.
> `git push` 가 CI(`wc-build.yml`)를 태워 라이브까지 나가므로 Dio님 승인 전에는 하지 않았다.

| 항목 | 값 |
|---|---|
| **라이브 버전** | **v1.4.46** (2026-08-18 배포분. 2026-09-03 `?cb=` 재확인) |
| **준비된 버전** | **v1.4.47** — 소스·`version.json`·번들 3자 일치 확인, **배포 대기** |
| 라이브 | https://wordcraft-app.vercel.app (관리자 `/#/admin`, PIN 7351) |
| 저장소 | **https://github.com/JKDIO/wordcraft-app** (2026-09-03 Dio님 확인. 로컬은 git 저장소가 아니다 — GitHub MCP 경유) |
| v1.4.47 번들 | main.js 518,763B (gzip 165,536B) · app.css 151,424B · content.json 1,953,791B |
| v1.4.47 sha256 | main.js `c2828475c903c203…` · app.css `d103043febe39f12…` · content.json `dd6a0d266b807048…` |
| Supabase | `gbynvzxgbpmoqdsriowz` · Edge Function `write-grade` **v5 배포됨**(앱보다 먼저 나가 있다) |
| 소스 SSOT | `_dev_github/src_v1.4.47/` |
| 콘텐츠 SSOT | `src_v1.4.47/app/public/content.json` (모듈 **64개** = 기존 52 + 이야기 서고 12) |
| 어휘 SSOT | `src_v1.4.47/app/public/vocab.json` (2,400단어 · 10티어) |

**노트북 툴체인 (2026-09-03 복구 — 이전에는 검사·빌드를 노트북에서 한 번도 못 돌렸다)**
```
npm install -g bun            # bun 1.4.0
cd src_v1.4.47/app && bun install
npm install --no-save typescript@5 @types/react @types/react-dom   # ★tsc 7.x 금지 — 아래 참고
TSC=./node_modules/.bin/tsc BUN_BIN=bun bash verify.sh
TSC=./node_modules/.bin/tsc BUN_BIN=bun bash build.sh
```
⚠️ **`tsc` 는 반드시 5.x.** 7.0.2(TypeScript Native)는 같은 소스에 React 19 JSX 오류 17개를 낸다(5.9.3은 0개).
verify ⑤ 가 이제 tsc 버전을 찍어 남긴다.

## v1.4.47 에 들어간 것 (요약 — 전문은 `RELEASE_v1.4.47.md`)
- ✍️ **자유 작문 채점기** — 서버 채점(OpenRouter T1~T2), 감사 모드, `answer_events` additive
- 📚 **이야기 서고(월드 10)** — 읽기 6 + 쓰기 6 모듈, 지문 18 · 4지선다 72 · 자유작문 12
  **`writing_ready` 스위치로 닫아 둔 채 배포한다.** 기존 52개 모듈의 진도·뱃지 무변경
- 🎨 관제실 톤 격상 + 오라 4겹·파티클 11개 (CSS만, 마크업 불변)
- 🛡️ 기사 갤러리 오버레이 **24장 본 생산 완료** (Storage 업로드는 미실행 — 갤러리 화면이 아직 없다)
- 🧪 **검사 15종**(신규 `reading_check` · mask-image 게이트) + **verify.sh 가 타입 검사 실패를 삼키던 결함 봉합(D47-11)**

**진실 3종 대조** — 세션 시작 시 이 셋을 **실제로 열어서** 읽는다(L13 + L39):
① `_dev_github/RELEASE_v<버전>.md` ② 라이브 `/version.json?cb=…` ③ 소스 `app/src/lib/version.ts`의 `APP_VERSION`

## ★2026-08-16 — 독립 교차 검증(Stage A) + 전면 봉합(Stage B)★

이전 세션의 주장을 **가설로 두고** 재현·실측으로 다시 판정했다. 상세: `RELEASE_v1.4.40.md`.

**다음 세션이 반드시 알아야 할 것 넷**

1. **관제실 수치의 의미가 바뀌었다.** 데스크톱(아빠 PC) 기록은 이제 **집계에서 제외**된다 —
   이전 수치의 89.2%가 이 오염이었다. 옛 스크린샷·옛 보고서의 숫자와 지금 화면은 **다른 게 정상**이다.
2. **출석 기준은 `ATTENDANCE_RULE` 한 곳에서만 정의한다** (문항 기록 + 아이 기기 + 집중 15분).
   새로 출석을 세는 코드를 어디에도 추가하지 말 것. 예한이 연속 기록은 이 기준으로 **4일 → 0일**로 재계산됐고,
   **최고 기록(🏆)은 보존**된다.
3. **복습에 하루 상한(60장)과 읽는 시간 게이트(900ms)가 생겼다.** 오답 리스폰은 상한 예외다.
   채점 버튼은 매 카드 좌우가 무작위로 바뀐다(`gradeSwapped`, `review.ts`) — 화면이 아니라 **라이브러리에** 규칙이 있다.
4. **검사 체계가 허수였다.** `verify.sh`가 부르던 11개 중 실재한 건 `admin_check.mjs` 하나였다.
   5개를 새로 썼고(`xp_parity`·`badge_check`·`reward_check`·`review_check`·`query_check`),
   **5개는 아직 미복원**(`measure20`·`golem_check`·`summon_check`·`summon_smoke`·`w710_check`) → **콘텐츠 영역은 미검증**.

## 구조 (이전 세션에서 세운 것 — 그대로 유효)

### ★배포 방법 (2026-08-16 v1.4.41부터 — 사람 손이 필요 없다)★

```
_ci/src.patch(.b64) + _ci/src.patch.sha  ──▶ wc-src-patch
   git apply → 파일마다 blob SHA 대조(어긋나면 커밋 0) → bun build → 크기·버전 게이트
   → 루트 main.js·app.css 갱신 + push ──▶ Vercel
```

- 세션에서 `git push`가 막혀도(L55) **GitHub API로 작은 diff만** 올리면 배포가 끝난다.
- `git diff` 결과를 gzip+base64 하면 더 안전하다(`_ci/src.patch.b64`) — 공백 손실 위험이 없다.
- **blob SHA 대조가 통과하지 못하면 아무것도 커밋되지 않는다.** 반쯤 배포되는 일은 구조적으로 없다.

### 배포 자동화 (브라우저 드래그 금지)

```
작은 소스 파일 커밋 (app/**) ──▶ GitHub Actions wc-build ──▶ 루트 main.js·app.css ──▶ Vercel 자동배포
```

- **소스 트리는 저장소 `app/` 에 있다.** CSS는 `app/public/css.d/NN-이름.css` 조각으로 추가한다(`app.css` 통째 수정 금지).
- CI 결과는 `_ci/BUILD_REPORT.txt`(크기·sha256·gzip)로 되돌아온다 — 460KB를 읽을 필요가 없다.
- 수동 재빌드: `_ci/build.txt` 를 아무 내용으로 커밋. 안전장치: 번들 300KB 미만이면 CI 실패.
- ⚠️ **클라우드 세션에서 `git push`가 막힐 수 있다**(저장소가 세션 소스에 없으면 프록시가 403).
  그때는 `_dev_github/_UPLOAD_v<버전>/upload/` 를 만들어 GitHub 웹에 **한 번에** 업로드하고,
  올라간 뒤 blob SHA를 전수 대조한다. (2026-08-16 실제 경로)

### 이미지 자산 자동화

```
fal.ai URL ──▶ SQL(pg_net) ──▶ Edge Function art-forge ──▶ Storage art/hero/*.png
                               Edge Function art-layer ──▶ Storage art/hero/layer/*.png
```

이미지 바이트가 **모델 문맥을 통과하지 않는다**(L33). 현재 자산: 베이스 1 + 합본 44 + 투명 레이어 44.

### 문서 append 구조

| 옛 방식 | 새 방식 |
|---|---|
| `RELEASE_LOG.md`(150KB)에 append | `_dev_github/RELEASE_v<버전>.md` 릴리스마다 한 파일 |
| `개발_영구교훈_LESSONS.md`(52KB)에 append | 1권 L0~L32 · 2권 L33~ · 3권 L45~ · **4권 `LESSONS_4_L51이후.md` L51~** |
| `00_START_HERE_개발현황.md`에 스탬프 | 스탬프는 **이 파일** |

## 다음 작업 (우선순위)

1. **★예한이 실기기(A24 WebView) 13항목 확인★ — 최종 판정.**
   특히 ⓐ 채점 버튼 좌우 교체가 "재미있는 긴장"인지 "짜증나는 오터치"인지(내 판단이 아니라 아이의 반응이 정한다)
   ⓑ 900ms 게이트가 답답하지 않은지 ⓒ 12px로 올린 글자가 레이아웃을 깨지 않는지
   ⓓ 조립 게임 `alt_answers` 정답 처리 ⓔ 장비창 스프라이트 로딩 ⓕ 정보 화면 버전 표기.
2. **실사용 1회분 대조** — 아이가 한 세션 돌린 뒤 관제실 수치와 DB를 맞대 본다. 이게 나와야 Stage B가 PASS다.
3. **콘텐츠 검사 5종 복원** — `measure20`·`golem_check`·`summon_check`·`summon_smoke`·`w710_check`. 지금은 미검증 구역이다.
4. 월드 7~10에서 **판단을 남긴 것들** — `tts` 90자 초과 32건 · S4 speak 원고 250자 · G2-Q1-8 tts 콤마 ·
   월드 9 step3 choice 4문항(규격 6). 상세는 `앱개발/진행상황_20260815_월드7-10_적대적검증.md` §7
5. 슬롯 등급 사이 진행도를 발광 세기로 표현할지 Dio님 판단

## 최근 릴리스

- **v1.4.42** — ★월드 번호 재정렬 7~10 → 6~9★(빈 6번 메움) · 번호 연속성 검사 · content-apply CI 버그 봉합
- **v1.4.41** — 월드맵 마이너스 표기 봉합(L51 재발) · 소비자 검사 전수화 · wc-src-patch 배포 경로 신설
- **v1.4.40** — 독립 교차 검증 Stage B 전면 봉합(기기 분리 · 출석 단일 기준 · 복습 무결성 · 큐 신뢰성 · 검사 5종 신설)
- **v1.4.39** — 관제실 날짜 집계 인덱스화(성능)
- **v1.4.36** — content.json 주소에 앱 버전 부착(옛 콘텐츠 캐시 잔존 방지)
- **v1.4.35** — 월드 7~10 결함 797곳 봉합 · 조립 게임 `alt_answers` 도입 · content.json 패치 CI 신설
- **v1.4.34** — 등급 상승 연출 · 사후 `APP_VERSION` 정정
- **v1.4.31** — 장비창을 128×128 부위 레이어 조립으로 전면 교체 + 배포·이미지 자동화 구축
