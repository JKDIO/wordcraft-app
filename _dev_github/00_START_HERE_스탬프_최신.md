# 🔖 START_HERE 스탬프 — 항상 이 파일이 최신 (2026-08-15)

> **왜 따로 있나**: `00_START_HERE_개발현황.md`는 23KB다. 세션마다 스탬프 한 줄 바꾸자고 통째로 다시 쓰면
> 읽기+쓰기로 매번 1만 토큰 넘게 든다(L34). 그래서 **자주 바뀌는 부분만** 이 작은 파일로 뗐다.
> START_HERE 본문(지도·불변 규칙·구조 설명)은 그대로 두고 **스탬프는 여기를 본다.**

## 현재 상태 (2026-08-15)

| 항목 | 값 |
|---|---|
| **배포 버전** | **v1.4.36** (소스 `APP_VERSION`·라이브 `version.json` 일치 확인) |
| 라이브 | https://wordcraft-app.vercel.app (관리자 `/#/admin`, PIN 7351) |
| 번들 | main.js 462,825B (gzip 146,647B) · app.css 121,365B · content.json 1,905,119B |
| Supabase | `gbynvzxgbpmoqdsriowz` |
| 예한이 진도 | **Lv.17 · 44,569 XP · 4일 연속** · 월드 1~5 완전정복 · **월드 7(독해 던전) 해금, 다음 관문** |

**진실 3종 대조** — 세션 시작 시 이 셋을 **실제로 열어서** 읽는다(L13 + L39):
① `_dev_github/RELEASE_v<버전>.md` ② 라이브 `/version.json?cb=…` ③ 소스 `app/src/lib/version.ts`의 `APP_VERSION`

## ★2026-08-15 — 월드 7~10 적대적 검증 완료★

24모듈 · 채점 문항 1,032 · 복습카드 288 · 음성 1,500개 전수 감사.
독립 3라운드에서 **290건 발견(P0 40) → 797곳 수정 → 102건은 근거를 적어 기각.**
상세: `앱개발/진행상황_20260815_월드7-10_적대적검증.md`

**앱이 바뀐 것 두 가지 (다음 세션이 반드시 알아야 함)**

1. **`alt_answers`** (L42) — 조립 게임이 문법적으로 옳은 다른 어순도 정답으로 받는다.
   `OrderItem`·`SummonItem`에 `alt_answers?: string[]`. 현재 31문항 사용.
   ★어순 자체가 학습 목표인 문항에는 넣지 않는다★ — 대신 `prompt_ko`에 힌트.
2. **content.json 캐시 무효화** — `fetch('/content.json?v=' + APP_VERSION)`.
   **콘텐츠를 고치면 반드시 `APP_VERSION`을 올려야 아이 폰에 반영된다.**

**콘텐츠 배포 방법이 생겼다** (L43) — `content.json`(1.9MB)은 직접 커밋할 수 없다.
```
패치 배열 → gzip+base64 → _ci/content_ops.b64 + _ci/content_ops.meta 커밋
   → GitHub Actions `wc-content-apply` 가 적용 → Vercel 자동배포
```
`meta`에 `before`/`after` **정규화 sha256**을 적는다. 어긋나면 CI가 멈추고 아무것도 커밋하지 않는다.
정규화 = `sha256(json.dumps(d, sort_keys=True, ensure_ascii=False, separators=(',',':')))`

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

1. **★예한이 실기기(A24 WebView) 확인★** — 월드 7이 지금 아이의 다음 관문이다. 특히 **조립 게임에서 `alt_answers`가 실제로 정답 처리되는지**, 장비창 스프라이트 로딩, 등급 상승 연출, `정보` 화면 버전 표기. ★최종 판정★
2. 월드 7~10에서 **판단을 남긴 것들** — `tts` 90자 초과 32건(지문 통짜 음원이라 의도된 것으로 판정, 다만 '문장 단위 다시 듣기'는 앱 과제) · S4 speak 원고 250자 · G2-Q1-8 tts 콤마(전 코퍼스 일괄 사안) · 월드 9 step3 choice 4문항(규격은 6). 상세는 진행상황 문서 §7
3. 노트북 루트의 `main.js`·`app.css`·`content.json` 은 낡았다(CI가 다시 만드는 파일이라 SSOT 문제는 아님)
4. 슬롯 등급 사이 진행도를 발광 세기로 표현할지 Dio님 판단

## 최근 릴리스

- **v1.4.36** — content.json 주소에 앱 버전 부착(배포해도 옛 콘텐츠가 캐시로 남는 것 방지)
- **v1.4.35** — 월드 7~10 결함 797곳 봉합 · 조립 게임 `alt_answers` 도입 · content.json 패치 CI 신설
- **v1.4.34** — 등급 상승 연출 · 사후 `APP_VERSION` 정정
- **v1.4.33** — 자산 주소에 `ART_VER` 붙여 캐시 무효화 · 곡괭이 1·3등급 재생성
- **v1.4.32** — 오타 '뭃지'→'뱃지', 장비칸 순서를 뱃지 도감과 일치
- **v1.4.31** — 장비창을 128×128 부위 레이어 조립으로 전면 교체 + 배포·이미지 자동화 구축
