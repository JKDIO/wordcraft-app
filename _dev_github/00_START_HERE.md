# 🚩 START HERE — WordCraft 개발 현황 (새 세션 최초 필독)

> **현재 상태 스탬프 → 라이브 v1.4.21 (2026-08-13, ★뱃지 36종 + 관제실 정합★).**
> v1.4.21 = ① 뱃지 17→**36종**(신규 19: 단어 대륙·수호자·골렘·워드몬 전설·분류 상자·속사 사냥·룬·소환진), 분야 5종으로 묶어 표시
>  ② **뱃지 판정 단일 규칙화** — `BadgeFacts → earnedFrom()` 하나. 앱/관제실이 각자 사실만 만들고 규칙은 공유(L27을 뱃지에도 적용)
>  ③ **★관제실 정합★** — `module_progress`에 섞여 들어오던 어휘 팩 200·골렘 40이 **"모듈 클리어 27/28"처럼 모듈 진도에 합산되고 있었다**(P0 표시 오류). `isLearnModuleId()`로 전 모듈 지표를 걸렀고, 취약 영역·반복 오답도 모듈/어휘 분리
>  ④ **관제실 진행 탭에 「🗺️ 단어 대륙」 패널 신설** — 정복/200 · ★★★ · 어휘 정답률 · 골렘/40 · 수호자/10 · 워드몬 진화 분포 · 티어 10줄(각성 아이콘·골렘) · 어휘 취약 구역
>  ⑤ **`verify.sh` 신설** — 타입검사 → XP 패리티 → 뱃지 판정 → 문항 계측 → 골렘·속사 → 버전 3자 대조를 한 줄로
> (v1.4.20) 단어 대륙 이야기(수호자 10·팩 결말 200) + 분류 상자·속사 사냥·단어 골렘 / (v1.4.19) 워드몬·단어 도감
> 📊 계측: 탭 비율 33.5%(티어별 31.2~35.2%) · 정답 위치 25.67/24.89/25.91/23.54% · 골렘 40·속사 200팩·문항 무결성 **0결함** · 뱃지 36종 경계값 통과 · XP 패리티 통과
> ⚠️ **아직 안 검증한 것**: 예한이가 실제로 재미있어하는지 · 관제실 정합은 **모의 데이터로만** 확인(실데이터 확인 필요)
> ⚠️ **배포 절차(필수)**: `bash verify.sh` → 빌드 → `bash verify.sh`(버전 3자 대조 포함) → 배포 → 라이브 SHA 대조
> ⚠️ 소스 SSOT = 노트북 `_dev_github/src_v1.4.21/`(+ tgz). 어휘 SSOT = `wordcraft_vocab_v1.4.20.json`. 계약 = `연동계약_CONTRACT.md` **v1.6**. 세계관 = `claude/단어대륙_월드바이블_v1.md`.

## ⚡ 지금 최우선 (2026-08-13~)
1. **예한이 폰 실사용 확인** — ① 첫 팩에서 소리가 나는지 ② 도입/결말 화면을 읽는지 건너뛰는지 ③ 분류 상자를 손가락으로 다룰 만한지 ④ 15~20분에 몇 팩을 하는지. **이게 최종 판정이다.**
2. **골렘 첫 등장** — 팩 5개를 끝내면 T1에 흙덩이 골렘이 뜬다. 들어가는지, 12칸을 다 깨는지.
3. **관제실 실데이터 확인** — 진행 탭 「단어 대륙」 패널이 예한이 실제 데이터로 맞게 나오는지. 모듈 클리어 숫자가 정상인지(어휘가 안 섞였는지).
4. **뱃지** — 예한이가 어휘를 시작하면 🗺️첫 상륙이 바로 떠야 한다. 안 뜨면 syncBadges 경로 점검.
5. **청취 확인표(HTML)** — 재생성 4개(tuesday·sweat·let·leader) 반드시 확인.
6. **가족 기능** — 남은 것은 ① 예한이 폰(WebView) 확인 ② **진영이네 부모 실제 로그인 왕복**(아직 guardians=0).
7. **데이터 정리(Dio님 승인 필요)** — 준비 완료, **미실행**. `앱개발/데이터정리_승인대기_20260813.md`.
8. **이월 과제** — `public/app.css`↔배포본 크기 불일치 · v1.4.2 소환진 픽셀 델타 · PWA 서비스워커 · v1.4.15 재생성 클립 11개 청취 확인 · 정답 위치 4번째 칸 23.54%(하한 근접, 다음 릴리스 재확인) · 분류 음절 기준 2,400단어 전수 대조 · 과거 XP 소급 보정(하지 않기로 함).
9. **나중에 검토** — 아빠와의 단어 대결(Dio님 제외 지시) · 적응형 문항 수 · 수호자 음성.

## 🗺️ 단어 대륙 구조 (새 세션 필독)
- 데이터: 루트 `/vocab.json`(1.44MB, 지연 로드). `{version, audio_ready, tiers[10], packs{200}}`. 팩 = `{pack_id:'V3-07', tier, theme_ko, title_ko, emoji, intro_ko, words[12]}`. 단어 = `{w, ko, pos, ipa, ex, ex_ko, hint_ko, distractors[3], tags, tts, audio_url, audio_ex_url}`.
- 코드: `src/lib/vocab.ts`(잠금 규칙·문항 생성·셔플·복습 시드) + `src/screens/VocabContinent.tsx`(지도 + 세션 4단계: 사전 스캔 → 학습 카드 → 게임 → 결과).
- 잠금: 티어1 항상 열림 / 티어N은 N-1을 80%(16/20) 정복 시 / 팩은 미완료 중 앞 3개가 동시에 열림(자율성).
- 기록: `answer_events.activity_type='vocab'`, `module_id=<pack_id>`, xp reason `vocab_correct(+5)`·`vocab_pack(+30)`·`vocab_perfect(+15)`. 복습 카드 `card_id='vocab:<단어>'`. **스키마 변경 0**.
- 음원: 단어 `audio_url`, 예문 `audio_ex_url`. 경로 = `vocab/<slug>_<sha1앞6>_nova.mp3`. **시딩기 = Edge Function `vocab-seed`**(dry-run으로 sha256 교차검증 후 실행할 것).
- ⚠️ **콘텐츠를 고치면 예문 클립 경로가 바뀐다** — 반드시 `vocab-seed` 재실행 → `tts-batch` → **파형 재감사**까지 하고 배포할 것. (v1.4.16에서 검수로 예문 72개가 바뀌어 클립 72개를 새로 만들어야 했다.)

## 0. ⚠️ 이 문서는 낡을 수 있다 — 신뢰 순서 (먼저 읽기)
이 문서는 **"지도 + 마지막 세션 스냅샷"**이다. 위 스탬프가 실제와 다르면 이 문서가 낡은 것.
**낡지 않는 진실:**
1. **프로젝트 메모리 `RELEASE_LOG.md`** (append-only, 맨 위=최신 = **v1.4.21**).
2. 라이브 `https://wordcraft-app.vercel.app/version.json` (WebFetch 시 캐시버스터 `?cb=...` 필수). 현재 **1.4.21**.
3. 소스 `APP_VERSION` = 로컬 `src_v1.4.21/src/lib/version.ts` = '1.4.21'.
4. **(v1.4.18 근접사고 이후 추가)** 배포 직전 **빌드된 번들에 박힌 버전 문자열**을 grep으로 확인 — 컨테이너 파일은 되돌아가 있을 수 있다(L25).

**세션 종료 시(필수):** 코드/배포 변경 시 ① RELEASE_LOG 항목 추가 ② 이 문서 스탬프·다음작업 갱신 ③ **기록 3종 동기화(L14·L20: 프로젝트 메모리 + 로컬 + GitHub) — 미루지 말 것.**

## 1. 지금 상태
- **제품**: 예한이(초6) 영어 학습 웹앱 "WordCraft". 한 번들(main.js)에 두 앱 — 학습자 앱(예한이) + 관제실(아빠, `/#/admin`, PIN 7351).
- **라이브 v1.4.21**: 학습(유령 보스·수정 동굴·소리 훈련소·문장 소환진·복습 라이트너·출석 15분) + **단어 대륙(2,400단어/200팩) + 워드몬 진화 + 단어 도감 + 이야기(수호자 10·팩 결말 200) + 분류 상자 + 속사 사냥 + 단어 골렘 40 + 뱃지 36종** + 다가구 인증 라우팅 + 가족 RLS 격리 + **전 재생 항목 음원화**.
- **예한이 폰(갤럭시 A24)**: APK지만 `server.url=wordcraft-app.vercel.app` 라이브 직접 로드 → **웹 배포 = 폰 즉시 반영**. 음원은 Storage 직접 로드(`cache-control: no-cache` → 교체 즉시 반영, 앱 배포 불필요).
- **DB**: Supabase `gbynvzxgbpmoqdsriowz`. families·memberships·learners·answer_events·xp_events·review_cards·module_progress·sessions·tts_clips. Storage `tts-audio` = **1,448 클립 / 55.5MB**. Edge: `tts-batch`(v4) · `tts-seed`(v1).

## 2. 🔒 철칙 (어기면 사고 재발)
1. **소스 SSOT = 로컬 `_dev_github/src_v1.4.21/`(+ tgz), 콘텐츠 SSOT = `wordcraft_content_v1.4.15.json` + 어휘 `wordcraft_vocab_v1.4.16_final.json`.** 컨테이너에서만 고쳐 배포 금지.
2. **두 앱 공동 기록** (RELEASE_LOG에 예한이 앱+관제실+연동 함께).
3. **연동 계약 준수**(`앱개발/연동계약_CONTRACT_v1.md`, 현재 **v1.6** — §14 관제실 정합 규약 신설). v1.4.21에서 CONTRACT를 **v1.6**으로 갱신 완료(XP v5·뱃지 v3·§13-A·§14). 스키마 변경은 여전히 0.
4. **배포는 모아서 1회 + 스냅샷**(L1). 대용량은 모델 문맥 무통과(SendUserFile·device_commit — L0/L7).
5. **answer_events 절대 삭제 금지.** 모든 변경 additive(L17).
6. **기록 3종 동기화(L14·L20)** — 프로젝트 메모리+로컬+GitHub, 미루지 말 것.
7. 옛 배포 URL 은퇴(L15). WebView≠크롬(L8). 배포 전 --production+playwright 스모크(L16). 오디오 계약 건드리면 재생 호출부 전수감사(L19). 오디오는 세대로 관리(L21). **음원은 파형으로 검수(L22).** 배포 전 `bash verify.sh`(L27). 세션 만료≠로그아웃(L23). 4지선다 정답 위치 계측(L24). **배포물 버전은 번들 grep으로 실증(L25).** **교차 연습은 '손이 하는 행동'으로 계측(L26).**
8. **GitHub/웹 작업은 클로드가 직접 브라우저로(L20 Dio님 선호).** 단 비밀키 입력·민감 설정은 Dio님.

## 3. 구조 & 데이터 흐름 (요약 — 상세는 RELEASE_LOG·CONTRACT)
- 학습자 앱: 스플래시→월드맵(월드1·1.5수정동굴·2~5·소리훈련소·유령출몰)→모듈세션/유령전투/소리훈련소/소환진→복습광산→룬도감→내정보→정보. + `#/connect` 연결 화면.
- **인증 라우팅(App.tsx)**: 시작 시 getAuthUser → legacy(세션無=예한 하위호환)/device(익명=바인딩 아이)/guardian(구글=가족 대시보드 `#/family`).
- **오디오(v1.4.15)**: 재생 항목 **전부** `audio_url`(Storage 공개 클립). `lib/audio.ts` 단일 채널 + 세대 토큰. TTS는 **비상 폴백으로만 존재**(클립 404 시 무음 방지 — 절대 제거 금지, L19·L21⑤).
- 커리큘럼(28모듈): A1~A4/R0~R9/C0·C5·C6·C7/B21a·b·B22a·b/D1S·D2S·D3S/T1·T2·T3 + FORGE.

## 4. 파일 지도
| 위치 | 내용 |
|---|---|
| 로컬 `Word Craft/wordcraft-app/` | GitHub 배포 저장소 클론. 루트 main.js·content.json·**vocab.json(1.44MB)**·version.json = **v1.4.21** |
| `_dev_github/src_v1.4.21/` | **소스 SSOT** — App.tsx·screens/{…,VocabContinent,WordDex}·engine/·lib/{audio,tts,store,supabase,version,**vocab,wordmon**}·**tools/음원감사_AUDIO_QA.html** |
| `_dev_github/wordcraft_src_v1.4.21.tgz` | 소스 스냅샷. tgz→클린빌드 main.js md5 동일 검증됨(tgz→클린빌드 재현 검증) |
| `_dev_github/wordcraft_content_v1.4.15.json` | **콘텐츠 SSOT 스냅샷**(L20 ②) |
| ⚠️ `Desktop/YEHAN/Education/Yehan_English_App/_dev_github/` | **미끼 폴더 — 절대 SSOT로 쓰지 말 것.** v1.4.6(7/16)에서 멈춰 있다. 폴더 안에 경고 표지 파일을 넣어뒀다(2026-08-13). 이력 보관용으로만 남긴다 |
| `_dev_github/wordcraft_vocab_v1.4.16_final.json` + `vocab_packs_v3_final.tgz` | **어휘 SSOT 스냅샷** — 200팩 2,400단어 + 저작 원본 |
| `_dev_github/RELEASE_LOG.md` / `00_START_HERE.md` | 개발 원장·현황(GitHub 동반 업로드) |
| Supabase `gbynvzxgbpmoqdsriowz` | DB + Auth(구글·익명) + Storage(tts-audio 1,448) + Edge(tts-batch v4, tts-seed) |
| GitHub `JKDIO/wordcraft-app` | 배포 저장소 → Vercel 자동배포 |

## 5. 빌드 & 배포 퀵스타트 (컨테이너 — 빈 컨테이너 전제)
```
# device_stage_files로 _dev_github/wordcraft_src_v1.4.21.tgz 스테이징
mkdir -p /home/claude/wcbuild && cd /home/claude/wcbuild
tar xzf "/mnt/user-data/uploads/.../wordcraft_src_v1.4.21.tgz"
ln -sfn /home/claude/.npm-global/lib/node_modules node_modules   # react 전역
/home/claude/.npm-global/bin/tsc -p tsconfig.json
NODE_ENV=production bun build src/main.tsx --outdir dist --minify --production   # ★--production(L16)
# 스모크: dist+public을 serve/에 → http.server + playwright로 10라우트 렌더+JS에러0
```
배포: main.js(+version.json, 콘텐츠 변경 시 content.json·app.css) → SendUserFile→`/mnt/user-data/outputs/`→ **claude-in-chrome file_upload로 GitHub 루트 업로드·커밋** → Vercel → 라이브 검증(version.json + 실렌더 + **음원 감사 PASS**).

## 6. 음원 파이프라인 (v1.4.16 기준 — 새 콘텐츠를 만들 때 반드시 이 순서. 어휘는 `vocab-seed`, 그 외는 `tts-seed`)
1. 콘텐츠에 `tts`(재생 텍스트)와 `voice`를 넣는다. **voice 누락 시 nova 기본**(CONTRACT §9).
2. `tts-seed` Edge Function 호출(`x-wc-gate` 헤더 필요, pg_net `net.http_post`로 컨테이너에서 호출 가능) → 라이브 content.json을 읽어 클립 경로를 산출하고 `tts_clips`에 pending 시딩. `{"dry":true}`로 먼저 개수·sha256 확인.
3. `tts-batch` 호출(`{"hop":0}`) → 자기 연쇄로 전량 생성. 손상 복구는 `{"force":true}` + 해당 행 `status='pending'`.
4. `build_content.py`(또는 동일 규칙 주입)로 content.json에 audio_url 반영.
5. **`tools/음원감사_AUDIO_QA.html`로 전수 파형 감사 → PASS 아니면 배포 금지(L22).**
6. 신규 클립은 표본 청취(단어가 맞는지)까지 하고 릴리스한다.

## 7. 세션 시작 체크리스트
1. 이 문서 + `claude/개발_영구교훈_LESSONS.md` 읽기.
2. 진실 확인: 라이브 version.json(캐시버스터=1.4.21) · RELEASE_LOG 맨 위(v1.4.21) · 로컬 `src_v1.4.21` APP_VERSION · **빌드 번들 grep**(L25).
3. 컨테이너 비었으면 §5로 소스 복구·빌드(tgz = v1.4.21).
4. 작업 후: RELEASE_LOG·이 문서 갱신 + 기록 3종 동기화(L14·L20).

---
*교훈: `개발_영구교훈_LESSONS.md` (L0~L24 — 특히 L19 오디오 전수감사, L20 로컬↔GitHub 동시기록, L21 오디오 세대 관리, **L22 음원은 파형으로 검수**, **L23 세션 만료 오판 = 계정 증식**, **L24 4지선다 정답 위치 분포 계측**).*
