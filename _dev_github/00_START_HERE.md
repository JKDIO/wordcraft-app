# 🚩 START HERE — WordCraft 개발 현황 (새 세션 최초 필독)

> **현재 상태 스탬프 → 라이브 v1.4.7 배포됨 (2026-07-23, 다가구 A 인증 라우팅 — version.json·#/connect 실렌더 확인). 🏗️ 남은 것 = ① 구글 로그인 왕복 실측(Dio님 브라우저·후속) ② Phase 3(RLS 가족 격리).**
> ⚠️ 소스 SSOT = **노트북 로컬 `Word Craft/wordcraft-app/_dev_github/src_v1.4.7/`(+ 같은 폴더 `wordcraft_src_v1.4.7.tgz`)**. (폴더 `src_v1.4.6_recon`는 낡은 사본 — Dio님이 _to_delete로 정리 가능.) GitHub `_dev_github`엔 v1.4.7 배포 회차에 RELEASE_LOG·이 문서·tgz 동반 업로드로 동기화(L20 밀린 v1.4.1~1.4.6 기록 해소).

## ⚡ 지금 최우선 — 다가구 마무리 & Phase 3 (2026-07-23)
**새 세션은 `앱개발/진행상황_20260723_다가구_A라우팅_v1.4.7.md`를 먼저 읽어라(A 완료 + 배포 내역). 그 전 컨텍스트는 `진행상황_20260723_다가구_Phase1_DB.md`.**
- 승인된 청사진: `claude/기획_20260723_다가구확장_구글로그인_배포체계.md` + 데스크톱 아티팩트 "wordcraft-multifamily-blueprint".
- **완료**: Phase 0·1(스키마·예한이 Family#1 `YEHAN-7264` 무손실)·2-A(OAuth 설정)·2-B(RPC)·2-C(Auth·Connect)·**✅ A 인증상태별 라우팅(v1.4.7, App 3분기·FamilyDashboard·AdminPage 아이별화)**·**✅ 배포(라이브 1.4.7, #/connect 실렌더 확인)**.
- **다음**: ① **구글 로그인 왕복 실측** — Dio님이 PC 크롬에서 `wordcraft-app.vercel.app/#/connect` → 부모 구글 로그인 → `#/family` → 가족코드 `YEHAN-7264`(관계 아빠) → 예한 목록 → 예한 관제실 / 아이: #/connect → 아이 → 코드 → 프로필 → 연결. Supabase Authentication→Users 신규 유저 확인. ② Phase 3.
- **설계 결정(2026-07-23)**: 기존 예한이·아빠 앱엔 `#/connect` 진입 버튼을 **넣지 않는다**(학습 보존 + 아이 기기 오조작 방지). 새 보호자·가족은 `#/connect` **링크 전달**로 온보딩.
- **함정**: Supabase 설정/Users 페이지는 클로드 자동화 브라우저에서 스켈레톤(먹통) → Dio님 브라우저로. 마운트 덮어쓰기 잠금(L18)→신규 폴더/rename-swap. 04_CONTENT 유실(content.json 산출물만).

## 0. ⚠️ 이 문서는 낡을 수 있다 — 신뢰 순서 (먼저 읽기)
이 문서는 **"지도 + 마지막 세션 스냅샷"**이다. 위 스탬프가 실제와 다르면 이 문서가 낡은 것.
**낡지 않는 진실:**
1. **프로젝트 메모리 `RELEASE_LOG.md`** (append-only, 맨 위=최신 = v1.4.7). ⚠️ GitHub `_dev_github/RELEASE_LOG.md`는 v1.4.7 배포 회차부터 동기화됨(그 전 낡음 이력).
2. 라이브 `https://wordcraft-app.vercel.app/version.json` (WebFetch 시 캐시버스터 `?cb=...` 필수). 현재 **1.4.7**.
3. 소스 `APP_VERSION` = 로컬 `src_v1.4.7/src/lib/version.ts` = '1.4.7'.

**세션 종료 시(필수):** 코드/배포 변경 시 ① RELEASE_LOG 항목 추가 ② 이 문서 스탬프·다음작업 갱신 ③ **기록 3종 동기화(L14·L20: 프로젝트 메모리 + 로컬 + GitHub) — 미루지 말 것.**

## 1. 지금 상태
- **제품**: 예한이(초6) 영어 학습 웹앱 "WordCraft". 한 번들(main.js)에 두 앱 — 학습자 앱(예한이) + 관제실(아빠, `/#/admin`, PIN 7351).
- **라이브 v1.4.7**: 기존 학습(유령 보스·수정 동굴·소리 훈련소·문장 소환진·복습 라이트너·출석 15분) + **다가구 인증 라우팅**(보호자 구글→가족 대시보드에서 아이별 관제실 / 아이기기 익명+가족코드→바인딩 아이 학습 / 세션無→레거시 예한). RLS 가족 격리는 Phase 3.
- **예한이 폰(갤럭시 A24)**: APK지만 `server.url=wordcraft-app.vercel.app` 라이브 직접 로드 → **웹 배포 = 폰 즉시 반영**.
- **DB**: Supabase `gbynvzxgbpmoqdsriowz`. families·memberships·learners.family_id·wc_join_family·wc_family_learners (전부 additive, RLS는 아직 anon 전개방 = Phase 3 관문).

## 2. 🔒 철칙 (어기면 사고 재발)
1. **소스 SSOT = 로컬 `_dev_github/src_v1.4.7/`(+ `wordcraft_src_v1.4.7.tgz`).** 컨테이너에서만 고쳐 배포 금지.
2. **두 앱 공동 기록** (RELEASE_LOG에 예한이 앱+관제실+연동 함께).
3. **연동 계약 준수**(`앱개발/연동계약_CONTRACT_v1.md` v1.4 — 다가구 스키마 계약 v1.5는 Phase 3 RLS 후. v1.4.7 라우팅은 스키마/XP/기록 불변 = 개정 불요).
4. **배포는 모아서 1회 + 스냅샷**(L1). 대용량은 모델 문맥 무통과(SendUserFile·device_commit — L0/L7).
5. **answer_events 절대 삭제 금지.** 모든 변경 additive(L17).
6. **기록 3종 동기화(L14·L20)** — 프로젝트 메모리+로컬+GitHub, 미루지 말 것.
7. 옛 배포 URL 은퇴(L15). WebView≠크롬(L8). 배포 전 --production+playwright 스모크(L16). 오디오 계약 건드리면 재생 호출부 전수감사(L19).
8. **GitHub/웹 작업은 클로드가 직접 브라우저로(L20 Dio님 선호).** 단 파일 드래그·비밀키 입력·민감 설정은 Dio님.

## 3. 구조 & 데이터 흐름 (요약 — 상세는 RELEASE_LOG·CONTRACT)
- 학습자 앱: 스플래시→월드맵(월드1·1.5수정동굴·2~5·소리훈련소·유령출몰)→모듈세션/유령전투/소리훈련소/소환진→복습광산→룬도감→내정보→정보. + `#/connect` 연결 화면.
- **인증 라우팅(v1.4.7, App.tsx)**: 시작 시 getAuthUser → legacy(세션無=예한 하위호환)/device(익명=바인딩 아이)/guardian(구글=가족 대시보드 `#/family`). guardian은 학습 세션·하트비트 미생성.
- 오디오: audio_url(Storage 공개클립) 우선 + 네이티브 TTS 폴백(lib/audio.ts). 재생 playClip 일원화(L19).
- 커리큘럼(28모듈): A1~A4/R0~R9/C0·C5·C6·C7/B21a·b·B22a·b/D1S·D2S·D3S/T1·T2·T3 + FORGE.

## 4. 파일 지도
| 위치 | 내용 |
|---|---|
| 로컬 `wordcraft-app/` | GitHub 배포 저장소 클론. 루트 main.js·version.json = **v1.4.7(md5 36ac102e…)** |
| `_dev_github/src_v1.4.7/` | **소스 SSOT(v1.4.7)** — App.tsx(인증 라우팅)·screens/(+Connect·+FamilyDashboard)·lib/{store,supabase,…,version}·engine 등 |
| `_dev_github/wordcraft_src_v1.4.7.tgz` | 소스 스냅샷(컨테이너 복구용). tgz→클린빌드 main.js md5 동일 검증됨 |
| `_dev_github/src_v1.4.6_recon/` + `..._recon.tgz` | v1.4.6 시점 사본(낡음 — 정리 대상) |
| `_dev_github/RELEASE_LOG.md` (GitHub) | v1.4.7 회차부터 프로젝트 메모리와 동기화 |
| Supabase `gbynvzxgbpmoqdsriowz` | DB + Auth(구글·익명) + Storage(tts-audio) + Edge(tts-batch) |
| GitHub `JKDIO/wordcraft-app` | 배포 저장소 → Vercel 자동배포 |

## 5. 빌드 & 배포 퀵스타트 (컨테이너 — 빈 컨테이너 전제)
```
# device_stage_files로 _dev_github/wordcraft_src_v1.4.7.tgz 스테이징
mkdir -p /home/claude/wcbuild && cd /home/claude/wcbuild
tar xzf "/mnt/user-data/uploads/.../wordcraft_src_v1.4.7.tgz"
ln -sfn /home/claude/.npm-global/lib/node_modules node_modules   # react 19.2.6 전역
/home/claude/.npm-global/bin/tsc -p tsconfig.json
NODE_ENV=production bun build src/main.tsx --outdir dist --minify --production   # ★--production(L16)
# 스모크: main.js+정적자산을 serve/에 → http.server + playwright로 #/·#/connect·#/family·#/admin 렌더+JS에러0
```
배포: main.js(+version.json, 콘텐츠 변경 시 content.json·app.css) → SendUserFile→device_commit→ **사용자가 GitHub 업로드 드래그** → Vercel → 라이브 검증. (v1.4.7 배포는 이 경로로 완료.)

## 6. 다음 작업
- **① 구글 로그인 왕복 실측(후속·Dio님)**: `#/connect` 링크로 부모 구글 로그인 → `#/family` → 가족코드 `YEHAN-7264` → 예한 목록/관제실 / 아이 코드 연결 / Supabase Users 확인. 되면 이 스탬프에 "구글 왕복 확인" 추가.
- **② Phase 3(RLS 가족 격리)**: anon 전개방 정책 폐기 → 멤버십 기반 RLS + 관제실 가족·아이별 분리 + CONTRACT v1.5. ⚠️ 모든 DB 호출부 세션 이관 전수감사(누락 시 빈 데이터). **다른 가족을 실제로 들이기 전 필수.**
- **③ 잔여 재구성 델타(가족 롤아웃 전 재적용)**: v1.4.1 뒤로가기 버튼·v1.4.2 소환진 explode/eat 픽셀(라이브 대조). 로그인 테스트엔 무해.
- **④ Phase 4**: 설치/업데이트(PWA 서비스워커·제네릭 APK·업데이트 배너).

## 7. 세션 시작 체크리스트
1. 이 문서 + `진행상황_20260723_다가구_A라우팅_v1.4.7.md` 읽기.
2. 진실 확인: 라이브 version.json(캐시버스터=1.4.7) · 프로젝트 메모리 RELEASE_LOG 맨 위(v1.4.7) · 로컬 `src_v1.4.7` APP_VERSION.
3. 컨테이너 비었으면 §5로 소스 복구·빌드(tgz = v1.4.7).
4. 작업 후: RELEASE_LOG·이 문서 갱신 + 기록 3종 동기화(L14·L20).

---
*교훈: `개발_영구교훈_LESSONS.md` (L0~L20 — 특히 L18 신규폴더/rename-swap, L19 오디오 전수감사, L20 로컬↔GitHub 동시기록·SSOT 유실 방지).*
