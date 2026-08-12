# 🚩 START HERE — WordCraft 개발 현황 (새 세션 최초 필독)

> **현재 상태 스탬프 → 라이브 v1.4.16 (2026-08-12, ★단어 대륙 엔진 상륙 + 월드맵 접기 + 가족 세션 봉합★).**
> ① **단어 대륙 🗺️(`#/vocab`)** — GIU 전체 + 중학 전 과정 **2,400단어(10티어 × 20팩 × 12단어)** 어휘 엔진. 사전 스캔·게임 5종 교차·힌트 3단계·라이트너 자동 시드. **입구는 `version.json`의 `vocab_ready`로 여닫는다 — 현재 false(음원 미생성).**
> ② **월드맵 월드별 접기** — 문서 높이 3,562→2,159px(-39%), 접힌 상태에서도 진행률·별·유령 표시.
> ③ **가족 P0 3건 봉합** — 세션 만료를 로그아웃으로 오판해 **익명 계정이 33개까지 증식**하던 결함(L23) + 보호자 기기가 아이 기기로 강등되던 경로 + 아이 딥링크 재방문 시 새 계정. 슈퍼 관리실에 **보호자 연결 현황**, 보호자 대시보드에 **아이별 한눈 요약** 추가.
> ⚠️ **다음 세션 최우선 2건 — 이게 끝나야 예한이에게 단어 대륙을 열 수 있다.**
>   **(1) 어휘 콘텐츠 교차 검수** — 검수팀 5팀이 세션 한도로 전원 중단됐다. 40팩만 부분 수정됨. 뜻·IPA·예문·오답 타당성 미검증(콘텐츠 헌법 5: 검수 없는 콘텐츠 노출 금지).
>   **(2) 음원 4,799개 생성 + 파형 전수 감사(L22)** — 현재 0개. PASS 후 `version.json`의 `vocab_ready`를 true로 올리면 앱 재배포 없이 입구가 열린다.
> (이전 스탬프) v1.4.15 (2026-08-01, 무음 음원 전면 봉합 + 폰 TTS 의존 완전 제거). 라이브 음원 감사 1,430/1,430 통과.
> ⚠️ 소스 SSOT = 노트북 `Word Craft/wordcraft-app/_dev_github/src_v1.4.16/`(+ `wordcraft_src_v1.4.16.tgz`). **콘텐츠 SSOT = `wordcraft_content_v1.4.15.json`(불변) · 어휘 SSOT = `wordcraft_vocab_v1.4.16.json` + `vocab_master_v1.json` + `vocab_packs_v1.tgz`(저작 원본 200팩·SPEC·스켈레톤).**

## ⚡ 지금 최우선 (2026-08-12)
1. **어휘 2,400단어 교차 검수 완료** — `vocab_packs_v1.tgz` 안 `packs/*.json` 200개. 표제어(`w`)는 바꾸지 말 것(전역 중복 검증이 끝난 상태 — 바꾸면 충돌 재발). 고칠 대상은 ko·ipa·ex·ex_ko·hint_ko·distractors.
2. **음원 생성** — `vocab_clip_manifest.json`(4,799 경로, scope=`vocab`, voice=`nova`) 기준으로 tts_clips 시딩 → `tts-batch` → `tools/음원감사_AUDIO_QA.html`로 파형 전수 감사 → PASS면 `version.json` `vocab_ready:true`.
3. **가족 봉합 실기기 확인** — 예한이 폰에서 한 시간 이상 뒤 재실행 시 **새 익명 계정이 더 안 생기는지**(DB `auth.users` 수 비교). 진영이네 부모 실제 로그인 왕복.
4. **데이터 정리(Dio님 승인 필요)** — 예한이네 `parent_name` null 채우기(이제 `#/super`에서 가능) · 테스트 잔여 학습자 "아이 1"(학습기록 0, `#/family`에서 삭제 가능) · 누적 익명 계정 33개와 중복 device 멤버십 17행 정리.
5. **이월 과제** — `public/app.css`(110,693B) ↔ 배포본 `app.css`(111,045B) 크기 불일치 · v1.4.2 소환진 픽셀 델타 · Phase 4(PWA 서비스워커) · CONTRACT v1.5 §13(어휘 계약) 문서화 · v1.4.15 재생성 클립 11개 청취 확인.

## 🗺️ 단어 대륙 구조 (신규 — 새 세션 필독)
- 데이터: 루트 `/vocab.json`(1.44MB, 지연 로드). `{version, audio_ready, tiers[10], packs{200}}`. 팩 = `{pack_id:'V3-07', tier, theme_ko, title_ko, emoji, intro_ko, words[12]}`. 단어 = `{w, ko, pos, ipa, ex, ex_ko, hint_ko, distractors[3], tags, tts, audio_url, audio_ex_url}`.
- 코드: `src/lib/vocab.ts`(잠금 규칙·문항 생성·셔플·복습 시드) + `src/screens/VocabContinent.tsx`(지도 + 세션 4단계).
- 잠금: 티어1 항상 열림 / 티어N은 N-1을 80%(16/20) 정복 시 / 팩은 미완료 중 앞 3개가 동시에 열림(자율성).
- 기록: `answer_events.activity_type='vocab'`, `module_id=<pack_id>`, xp reason `vocab_correct(+5)`·`vocab_pack(+30)`·`vocab_perfect(+15)`. 복습 카드 `card_id='vocab:<단어>'`. **스키마 변경 0**.
- 오디오 규약: 단어 클립 `audio_url`, 예문 클립 `audio_ex_url`. 경로 = `vocab/<slug>_<sha1앞6>_nova.mp3` (build_content.py의 `slug_of`와 동일 규칙).

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
*교훈: `개발_영구교훈_LESSONS.md` (L0~L24 — 특히 L19 오디오 전수감사, L20 로컬↔GitHub 동시기록, L21 오디오 세대 관리, **L22 음원은 파형으로 검수**, **L23 세션 만료 오판 = 계정 증식**, **L24 4지선다 정답 위치 분포 계측**).*
