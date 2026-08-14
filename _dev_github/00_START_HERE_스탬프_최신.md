# 🔖 START_HERE 스탬프 — 항상 이 파일이 최신 (2026-08-14)

> **왜 따로 있나**: `00_START_HERE_개발현황.md`는 23KB다. 세션마다 스탬프 한 줄 바꾸자고 통째로 다시 쓰면
> 읽기+쓰기로 매번 1만 토큰 넘게 든다(L34). 그래서 **자주 바뀌는 부분만** 이 작은 파일로 뗐다.
> START_HERE 본문(지도·불변 규칙·구조 설명)은 그대로 두고 **스탬프는 여기를 본다.**

## 현재 상태 (2026-08-14)

> 그림을 고치는 절차: fal 생성 → SQL 2번(art-forge → art-layer) → `heroSprite.ts`의 `ART_VER` +1 → CI 자동 배포

| 항목 | 값 |
|---|---|
| **배포 버전** | **v1.4.34** (소스 `APP_VERSION`도 1.4.34로 정정 완료 — 아래 ★ 참조) |
| 라이브 | https://wordcraft-app.vercel.app (관리자 `/#/admin`, PIN 7351) |
| 번들 | main.js 462,715B (gzip 146,586B) · app.css 121,365B |
| main.js sha256 | `cde284c2d5fd65589a44d6cd8647c54bab77d3a26fc004ffdb594d16ac45c6d7` (source_commit `d65b4fd`) |
| Supabase | `gbynvzxgbpmoqdsriowz` |
| 예한이 진도 | Lv.16 · 40,069 XP · 3일 연속 · 뱃지 25/71 · 모듈 28/52 |

**진실 3종 대조** — 세션 시작 시 이 셋을 **실제로 열어서** 읽는다(L13 + ★L39):
① `_dev_github/RELEASE_v1.4.34.md` ② 라이브 `/version.json?cb=…` ③ 소스 `app/src/lib/version.ts`의 `APP_VERSION`
→ **문서에 적힌 숫자를 믿지 말고 세 곳을 직접 연다.** 실제로 ③만 1.4.30에 멈춰 있어 오탐 배너가 떴다(L39).

## ★2026-08-14 마지막 작업에서 고친 것 / 밝혀진 것★

### 1. APP_VERSION 오탐 배너 (라이브 결함, 수정 커밋 `d65b4fd`)

v1.4.31~34 네 번의 배포에서 서버 `version.json`만 올리고 소스 `APP_VERSION`은 1.4.30에 방치했다.
→ **최신 번들을 쓰는 예한이에게도 "새 버전이 있어요" 배너와 하단 정보 탭 빨간 `!`가 상주**했고,
`정보` 화면 버전 표기도 v1.4.30으로 보였다. `APP_VERSION='1.4.34'` 로 정정해 push(`d65b4fd`) →
CI 재빌드(main.js sha256 `021ef9bf…` → `cde284c2…`) → Vercel 배포 →
**라이브 `#/info` 화면에서 "현재 v1.4.34 / 최신 v1.4.34 · ✓ 최신 버전을 쓰고 있어요" 및 정보 탭 빨간 `!` 소멸을 눈으로 확인했다(PASS).**
※ 단, PC 브라우저 확인이다. **예한이 폰(A24 WebView)은 캐시가 남아 한동안 옛 번들일 수 있다** — 실기기 확인은 여전히 미완.

### 2. 노트북 SSOT 동기화 완료 (L14 세 번째 다리)

`C:\Users\jkd83\Desktop\VIBE CODING\Projects\WordCraft\wordcraft-app` 가 진짜 폴더다.
(예전에 연결돼 있던 `…\Projects\Word Craft` — **띄어쓰기 있는 쪽은 빈 폴더**다. 헷갈리지 말 것)

- 새 스냅샷 **`_dev_github/src_v1.4.34/`** (57파일). `src_v1.4.30`을 복사한 뒤 델타 6개만 덮어썼다.
- 델타 전부 **GitHub `app/` 의 blob SHA와 일치 확인** — 한 글자도 안 틀렸다는 증명(L40).
- 노트북 쪽 도구 제약은 **L41** 에 표로 정리했다(filesystem MCP 사망 · device_bash 삭제 불가 · 워크플로 보호 등).

### 3. 컨테이너 작업본은 SSOT가 아니었다 (L40)

컨테이너 `/home/claude/wc` 와 GitHub `app/` 전수 대조 결과 **57개 중 14개 불일치**,
`src/lib/review.ts` 는 컨테이너에 아예 없었다. 그대로 노트북에 복사했으면 기능을 되돌릴 뻔했다.
→ **스냅샷은 GitHub에서 뜬다. 컨테이너는 초안이다.**

## 구조 (이전 세션에서 세운 것 — 그대로 유효)

### 배포 자동화 (브라우저 드래그 금지)

```
작은 소스 파일 커밋 (app/**) ──▶ GitHub Actions wc-build ──▶ 루트 main.js·app.css ──▶ Vercel 자동배포
```

- **소스 트리는 저장소 `app/` 에 있다.** CSS는 `app/public/css.d/NN-이름.css` 조각으로 추가한다(`app.css` 통째 수정 금지).
- CI 결과는 `_ci/BUILD_REPORT.txt`(크기·sha256·gzip)로 되돌아온다 — 460KB를 읽을 필요가 없다.
- 수동 재빌드: `_ci/build.txt` 를 아무 내용으로 커밋. 안전장치: 번들 300KB 미만이면 CI 실패.

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
| `개발_영구교훈_LESSONS.md`(52KB)에 append | 1권은 L0~L32 그대로, **L33부터는 `LESSONS_2_L33이후.md`** |
| `00_START_HERE_개발현황.md`에 스탬프 | 스탬프는 **이 파일** |

## 다음 작업 (우선순위)

1. **예한이 실기기(A24 WebView) 확인** — 장비창 스프라이트 로딩·프리로드 체감, 3열 레이아웃, 등급 상승 연출, 그리고 `정보` 화면 버전 표기가 v1.4.34인지. ★최종 판정★
2. **월드 7~10 독립 재검증** — 고친 사람 ≠ 검수한 사람. 여전히 미완
3. 노트북 루트의 `main.js`·`app.css`·`content.json` 은 **v1.4.30 시점 산출물**이라 낡았다(`version.json`만 1.4.34로 갱신했다). CI가 다시 만드는 파일이라 급하지 않지만, 다음에 노트북에서 직접 열어볼 일이 있으면 먼저 받아 둘 것
4. 슬롯 등급 사이 진행도를 발광 세기로 표현할지 Dio님 판단 (지금은 1/3·2/3·전부 지점에서만 그림이 바뀐다)

## 최근 릴리스

- **v1.4.34** — 등급 상승 연출(올라간 부위만 금색으로 튀어오르고 기사가 번쩍인다) · 사후 `APP_VERSION` 정정
- **v1.4.33** — 자산 주소에 `ART_VER` 붙여 캐시 무효화 · 곡괭이 1·3등급을 화면 왼쪽으로 재생성
- **v1.4.32** — 오타 '뭃지'→'뱃지' 수정, 장비칸 순서를 뱃지 도감과 일치, 장비 아래 분야 이름 표기
- **v1.4.31** — 장비창을 128×128 부위 레이어 조립으로 전면 교체 + 배포·이미지 자동화 구축
- **v1.4.30** — 뱃지 도감 기본 접힘
