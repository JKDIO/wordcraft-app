# 🚩 START HERE — WordCraft 개발 현황 (새 세션 최초 필독)

> **현재 상태 스탬프 → 라이브 v1.4.15 (2026-08-01, ★무음 음원 전면 봉합 + 폰 TTS 의존 완전 제거★). 예한이가 R4 스피드런·R5 불의 룬에서 "소리가 안 난다" 신고 → Storage 클립을 전부 디코딩해 파형을 측정하는 전수 감사 도입 → **완전 무음 클립 11개** 적발·재생성 + 여태 폰 TTS로만 소리내던 재생 항목 **1,470개(유니크 1,011)를 전부 실제 음원으로 교체**. 라이브 최종 감사 = **1,430/1,430 통과 · 무음 0 · 404 0 · TTS 의존 항목 0**. ⚠️ **예한이 실폰 실청취 + 재생성 11개의 "맞는 단어인지" 청취 확인은 아직 미완 — Dio님 확인 필요.**
> (이전 스탬프) 라이브 v1.4.14 (2026-07-29, 음성 이중 재생 전면 봉합 = 단일 오디오 채널). `lib/audio.ts` 세대(generation) 토큰 재설계 + `lib/tts.ts` 네이티브↔웹 이중 발화 차단 + 화면 이탈·백그라운드 전역 정지. 계측 1/7·0/4·8/10 → **7/7·4/4·10/10**.
> (이전) v1.4.13 다가구 완성형(부모 셀프서비스 + 아이 수정/삭제). `#/family`=내 가족 / `#/super`=소유자 전체 관리. 진영이네(부모 진영, 아이 찬영·호영, 코드 JINYOUNG-3607) 준비됨.
> (이전) v1.4.9~1.4.10 Phase 3 가족 데이터 격리(RLS) 적용·양방향 격리 실측 완료 + 라운드 나가기 복원.
> ⚠️ DB 마이그레이션 원장은 Supabase apply_migration에 기록. RLS 롤백은 anon_all_* 정책 재생성(USING true).
> ⚠️ 소스 SSOT = **노트북 `Word Craft/wordcraft-app/_dev_github/src_v1.4.15/`(+ 같은 폴더 `wordcraft_src_v1.4.15.tgz`)**. **콘텐츠 SSOT = 같은 폴더 `wordcraft_content_v1.4.15.json`**(L20 ② 이행 시작). GitHub `_dev_github`에 같은 회차로 동반 업로드.

## ⚡ 지금 최우선 — 예한이 실폰 청취 확인 (2026-08-01)
**이번 세션은 v1.4.15를 배포했다. 상세는 RELEASE_LOG v1.4.15 + `claude/개발_영구교훈_LESSONS.md` L22.**
- **① (Dio님) 재생성한 11개 클립이 "맞는 단어"를 말하는지 청취** — bag · three · so · cough · sofa · feel · fill · show · sick · though · the. 세션에서 전달한 `음원복구_확인표.html`로 30초면 확인 가능. **소리 유무는 계측으로 증명됐지만 단어가 맞는지는 사람만 판정할 수 있다.**
- **② (Dio님) 예한이 폰(갤럭시 A24)에서 A~T 월드·유령 보스 듣기 문항 실청취** — 여기가 이번에 새로 클립화된 영역이다. 특히 유령 보스 문항(90개)은 v1.4.14까지 폰에서 무음이었을 가능성이 높다.
- **③ 이월 과제**: `public/app.css`(110,693B) ↔ 배포본 `app.css`(111,045B) **크기 불일치 확인**(app.css를 배포하는 순간 회귀 위험) · v1.4.2 소환진 explode/eat 픽셀 델타 · Phase 4(PWA 서비스워커·설치) · 관제실 가족·아이별 전용 UI · 예한 실폰 다가구 자동이관 확인.
- **오디오 불변 규칙**:
  - (코드) 소리를 내는 코드는 **반드시 `lib/audio.ts`의 `playClip()`/`speakText()`만** 쓴다. 화면에서 `import { speak } from '../lib/tts'`가 보이면 그 자체가 결함(`grep -rn "from '.*tts'" src/`).
  - (콘텐츠) **재생 항목은 예외 없이 `audio_url`을 가진다.** `tts`만 있는 항목 = 폰에서 무음이 될 수 있는 항목이다.
  - (검수) **배포 전 `tools/음원감사_AUDIO_QA.html`를 돌려 PASS를 받는다(L22). 파일 존재 확인은 검수가 아니다.**

## 0. ⚠️ 이 문서는 낡을 수 있다 — 신뢰 순서 (먼저 읽기)
이 문서는 **"지도 + 마지막 세션 스냅샷"**이다. 위 스탬프가 실제와 다르면 이 문서가 낡은 것.
**낡지 않는 진실:**
1. **프로젝트 메모리 `RELEASE_LOG.md`** (append-only, 맨 위=최신 = **v1.4.15**).
2. 라이브 `https://wordcraft-app.vercel.app/version.json` (WebFetch 시 캐시버스터 `?cb=...` 필수). 현재 **1.4.15**.
3. 소스 `APP_VERSION` = 로컬 `src_v1.4.15/src/lib/version.ts` = '1.4.15'.

**세션 종료 시(필수):** 코드/배포 변경 시 ① RELEASE_LOG 항목 추가 ② 이 문서 스탬프·다음작업 갱신 ③ **기록 3종 동기화(L14·L20: 프로젝트 메모리 + 로컬 + GitHub) — 미루지 말 것.**

## 1. 지금 상태
- **제품**: 예한이(초6) 영어 학습 웹앱 "WordCraft". 한 번들(main.js)에 두 앱 — 학습자 앱(예한이) + 관제실(아빠, `/#/admin`, PIN 7351).
- **라이브 v1.4.15**: 학습(유령 보스·수정 동굴·소리 훈련소·문장 소환진·복습 라이트너·출석 15분) + 다가구 인증 라우팅 + 가족 RLS 격리 + **전 재생 항목 음원화**.
- **예한이 폰(갤럭시 A24)**: APK지만 `server.url=wordcraft-app.vercel.app` 라이브 직접 로드 → **웹 배포 = 폰 즉시 반영**. 음원은 Storage 직접 로드(`cache-control: no-cache` → 교체 즉시 반영, 앱 배포 불필요).
- **DB**: Supabase `gbynvzxgbpmoqdsriowz`. families·memberships·learners·answer_events·xp_events·review_cards·module_progress·sessions·tts_clips. Storage `tts-audio` = **1,448 클립 / 55.5MB**. Edge: `tts-batch`(v4) · `tts-seed`(v1).

## 2. 🔒 철칙 (어기면 사고 재발)
1. **소스 SSOT = 로컬 `_dev_github/src_v1.4.15/`(+ tgz), 콘텐츠 SSOT = `wordcraft_content_v1.4.15.json`.** 컨테이너에서만 고쳐 배포 금지.
2. **두 앱 공동 기록** (RELEASE_LOG에 예한이 앱+관제실+연동 함께).
3. **연동 계약 준수**(`앱개발/연동계약_CONTRACT_v1.md`). v1.4.15는 스키마·XP·기록 방식 불변 = 개정 불요.
4. **배포는 모아서 1회 + 스냅샷**(L1). 대용량은 모델 문맥 무통과(SendUserFile·device_commit — L0/L7).
5. **answer_events 절대 삭제 금지.** 모든 변경 additive(L17).
6. **기록 3종 동기화(L14·L20)** — 프로젝트 메모리+로컬+GitHub, 미루지 말 것.
7. 옛 배포 URL 은퇴(L15). WebView≠크롬(L8). 배포 전 --production+playwright 스모크(L16). 오디오 계약 건드리면 재생 호출부 전수감사(L19). 오디오는 세대로 관리(L21). **음원은 파형으로 검수(L22).**
8. **GitHub/웹 작업은 클로드가 직접 브라우저로(L20 Dio님 선호).** 단 비밀키 입력·민감 설정은 Dio님.

## 3. 구조 & 데이터 흐름 (요약 — 상세는 RELEASE_LOG·CONTRACT)
- 학습자 앱: 스플래시→월드맵(월드1·1.5수정동굴·2~5·소리훈련소·유령출몰)→모듈세션/유령전투/소리훈련소/소환진→복습광산→룬도감→내정보→정보. + `#/connect` 연결 화면.
- **인증 라우팅(App.tsx)**: 시작 시 getAuthUser → legacy(세션無=예한 하위호환)/device(익명=바인딩 아이)/guardian(구글=가족 대시보드 `#/family`).
- **오디오(v1.4.15)**: 재생 항목 **전부** `audio_url`(Storage 공개 클립). `lib/audio.ts` 단일 채널 + 세대 토큰. TTS는 **비상 폴백으로만 존재**(클립 404 시 무음 방지 — 절대 제거 금지, L19·L21⑤).
- 커리큘럼(28모듈): A1~A4/R0~R9/C0·C5·C6·C7/B21a·b·B22a·b/D1S·D2S·D3S/T1·T2·T3 + FORGE.

## 4. 파일 지도
| 위치 | 내용 |
|---|---|
| 로컬 `Word Craft/wordcraft-app/` | GitHub 배포 저장소 클론. 루트 main.js(md5 `45ae38e7…`)·content.json(md5 `1531260…`)·version.json = **v1.4.15** |
| `_dev_github/src_v1.4.15/` | **소스 SSOT** — App.tsx·screens/·engine/·lib/{audio,tts,store,supabase,version}·**tools/음원감사_AUDIO_QA.html** |
| `_dev_github/wordcraft_src_v1.4.15.tgz` | 소스 스냅샷. tgz→클린빌드 main.js md5 동일 검증됨 |
| `_dev_github/wordcraft_content_v1.4.15.json` | **콘텐츠 SSOT 스냅샷**(L20 ②) |
| `_dev_github/RELEASE_LOG.md` / `00_START_HERE.md` | 개발 원장·현황(GitHub 동반 업로드) |
| Supabase `gbynvzxgbpmoqdsriowz` | DB + Auth(구글·익명) + Storage(tts-audio 1,448) + Edge(tts-batch v4, tts-seed) |
| GitHub `JKDIO/wordcraft-app` | 배포 저장소 → Vercel 자동배포 |

## 5. 빌드 & 배포 퀵스타트 (컨테이너 — 빈 컨테이너 전제)
```
# device_stage_files로 _dev_github/wordcraft_src_v1.4.15.tgz 스테이징
mkdir -p /home/claude/wcbuild && cd /home/claude/wcbuild
tar xzf "/mnt/user-data/uploads/.../wordcraft_src_v1.4.15.tgz"
ln -sfn /home/claude/.npm-global/lib/node_modules node_modules   # react 전역
/home/claude/.npm-global/bin/tsc -p tsconfig.json
NODE_ENV=production bun build src/main.tsx --outdir dist --minify --production   # ★--production(L16)
# 스모크: dist+public을 serve/에 → http.server + playwright로 10라우트 렌더+JS에러0
```
배포: main.js(+version.json, 콘텐츠 변경 시 content.json·app.css) → SendUserFile→`/mnt/user-data/outputs/`→ **claude-in-chrome file_upload로 GitHub 루트 업로드·커밋** → Vercel → 라이브 검증(version.json + 실렌더 + **음원 감사 PASS**).

## 6. 음원 파이프라인 (v1.4.15 기준 — 새 콘텐츠를 만들 때 반드시 이 순서)
1. 콘텐츠에 `tts`(재생 텍스트)와 `voice`를 넣는다. **voice 누락 시 nova 기본**(CONTRACT §9).
2. `tts-seed` Edge Function 호출(`x-wc-gate` 헤더 필요, pg_net `net.http_post`로 컨테이너에서 호출 가능) → 라이브 content.json을 읽어 클립 경로를 산출하고 `tts_clips`에 pending 시딩. `{"dry":true}`로 먼저 개수·sha256 확인.
3. `tts-batch` 호출(`{"hop":0}`) → 자기 연쇄로 전량 생성. 손상 복구는 `{"force":true}` + 해당 행 `status='pending'`.
4. `build_content.py`(또는 동일 규칙 주입)로 content.json에 audio_url 반영.
5. **`tools/음원감사_AUDIO_QA.html`로 전수 파형 감사 → PASS 아니면 배포 금지(L22).**
6. 신규 클립은 표본 청취(단어가 맞는지)까지 하고 릴리스한다.

## 7. 세션 시작 체크리스트
1. 이 문서 + `claude/개발_영구교훈_LESSONS.md` 읽기.
2. 진실 확인: 라이브 version.json(캐시버스터=1.4.15) · RELEASE_LOG 맨 위(v1.4.15) · 로컬 `src_v1.4.15` APP_VERSION.
3. 컨테이너 비었으면 §5로 소스 복구·빌드(tgz = v1.4.15).
4. 작업 후: RELEASE_LOG·이 문서 갱신 + 기록 3종 동기화(L14·L20).

---
*교훈: `개발_영구교훈_LESSONS.md` (L0~L22 — 특히 L19 오디오 전수감사, L20 로컬↔GitHub 동시기록, L21 오디오 세대 관리, **L22 음원은 파형으로 검수**).*
