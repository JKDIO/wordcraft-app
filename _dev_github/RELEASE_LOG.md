# WordCraft 릴리스 로그 (RELEASE_LOG) — 단일 진실 원장

> **철칙 (2026-07-15 제정, Dio님 지시)**
> 1. **모든 배포는 이 파일에 기록한 뒤에만 한다.** 예한이 앱(학습자)과 관제실(아빠 앱)은 한 번들(main.js)이므로, 릴리스 항목은 **반드시 두 앱의 변경·영향을 함께** 적는다. 한쪽만 적힌 릴리스 기록은 불완전한 것으로 간주한다.
> 2. **소스 SSOT = 노트북 `03_APP/wordcraft/`.** 어떤 세션이든 코드를 바꾸면 배포 전에 노트북 소스에 먼저 반영한다. 클라우드 컨테이너에서만 고치고 배포하는 것 금지 (7/15 기능 유실 사고의 원인). *(2026-07-23 갱신: 노트북 SSOT 유실·재구성 → 현재 SSOT = `_dev_github/src_v1.4.7/` + `wordcraft_src_v1.4.7.tgz`.)*
> 3. 배포할 때마다 `06_RELEASES/src_snapshots/v{버전}_{날짜}/`에 소스 전체 스냅샷을 남긴다. *(현재: `_dev_github/`에 tgz로 로컬·GitHub 동시 보존 — L20.)*
> 4. `src/lib/version.ts`의 APP_VERSION과 `dist/version.json`의 version을 **같이 올린다** (다르면 정보 화면 업데이트 알림이 오작동).
> 5. 앱–DB 연동 규칙은 `03_APP/연동계약_CONTRACT.md`를 따른다. 스키마·XP 규칙·기록 방식을 바꾸면 계약 문서와 양쪽 앱 코드를 같은 릴리스에서 함께 수정한다.

---

## v1.4.9 (+v1.4.8) — 2026-07-23 (다가구 Phase 3: 기기 무중단 세션 이관 + 가족 데이터 격리 RLS)
- **배경**: v1.4.7로 보호자·아이 라우팅이 동작하나, 모든 테이블이 전면개방(격리 없음)이라 다른 가족을 들이면 서로 데이터가 보임. Phase 3 = **① 모든 기기에 인증 세션 부여 + ② 예한이 기존 기기 무중단 이관 + ③ 멤버십 기반 RLS**. (예한이 검도대회 출전으로 다운타임 허용 창에서 진행 — Dio님 승인.)
- **예한이 앱 (학습자)**
  - **v1.4.8**: App 시작 시 세션 없는 레거시 기기(로컬 learnerId 보유=예한 기존 기기)는 **자동 익명 로그인 + 그 learner에 device 바인딩**(`signInAnonymously`+`bindLegacyDevice`→신규 RPC `wc_bind_legacy_device`, SECURITY DEFINER). → RLS 격리 후에도 자기 데이터 접근 유지. 실패 시 레거시 폴백.
  - **v1.4.9**: `#/admin`(PIN 관제실) 경로도 **인증 세션을 확보**하도록(학습 세션은 여전히 미생성) — 격리 후 관제실이 anon으로 빈 데이터가 되는 것 방지.
- **관제실 (아빠 앱)**: 코드 변경은 세션 확보뿐(집계·화면 불변). 보호자 세션/바인딩된 device 세션으로 데이터 read.
- **연동 영향 / DB (마이그레이션)**
  - `phase3_wc_bind_legacy_device_rpc`: 레거시 기기 무중단 바인딩 RPC.
  - `phase3_membership_rls_isolation`: 전면개방(anon_all_*) 정책 폐기 → **멤버십 기반 격리**. 헬퍼(SECURITY DEFINER) `wc_my_family_ids`·`wc_my_learner_ids`·`wc_device_learner`. 정책: 읽기=내 가족의 learner 행 / 쓰기=device는 자기 learner만(WITH CHECK) / answer_events·xp_events는 insert만(삭제·수정 불가=계약 준수) / parent_rewards는 가족 아이 대상 지급. **롤백 = anon_all_* 재생성(USING true).**
  - additive(L17): 기존 행·컬럼·의미 불변, 접근 제어만 강화.
- **빌드·검증**: tsc 0 · bun --production · playwright 6라우트 스모크(JS에러0). **라이브 격리 실측(서버 재현)**:
  - 예한 기기(익명 세션+device 바인딩): 자기 learner/answer_events read OK · 자기 세션 write OK(201) · **다른 가족 read=빈값 · 다른 learner write=403**. 앱 화면에 예한(Lv.11·17,823XP·복습15장) 정상 로드.
  - 별도 테스트 가족 B 기기: 자기 read/write OK · **예한 learner/answer_events read=빈값 · 예한 write=403**.
  - 레거시 무중단 이관 재현: 세션 없던 기기가 자동 익명+바인딩 후 예한 정상 로드 확인.
- **검증 한계 (정직 보고)**: ① 예한이 **실기기(갤럭시 A24 WebView)** 에서의 1.4.9 자동 이관은 미확인(서버·데스크톱 재현만) — 예한이 복귀 후 실폰 첫 로드 시 자동 바인딩·학습 정상 확인 필요. ② 관제실 가족·아이별 UI 분리는 기존 AdminPage(learner 지정) 재사용 수준(전용 UI는 후속). ③ device 바인딩 위조 방지(learnerId 신뢰)는 후순위 하드닝.
- **배포**: v1.4.8·v1.4.9 각각 main.js+version.json GitHub 루트 업로드(클로드 직접 file_upload)→Vercel. 라이브 version.json 1.4.9 확인.
- **기록**: 소스 SSOT = `_dev_github/src_v1.4.9/` + `wordcraft_src_v1.4.9.tgz`. DB 마이그레이션 3건 Supabase 원장 기록.

## v1.4.7 — 2026-07-23 (다가구 확장 A: 인증 상태별 앱 라우팅)
- **배경**: 다가구(지인 가족) 확장 Phase 2-C 완결. 앞서 완료된 Phase 0·1(families·memberships·learners.family_id, 예한이=Family#1 `YEHAN-7264`)·2-A(구글/익명 OAuth 설정)·2-B(RPC)·2-C 코어(Auth 세션·Connect 화면) 위에, **인증 상태로 앱이 자동으로 갈라지도록** 하는 라우팅을 통합. 원칙: additive(L17)·예한이 기존 흐름 무손실·RLS는 Phase 3.
- **예한이 앱 (학습자)**
  - [신규] **인증 상태별 3분기 라우팅** (App.tsx): 앱 시작 시 `getAuthUser()`로 판별 → **legacy**(세션無 = 기존 예한이 기기, 100% 종전 동작) / **device**(익명 로그인 = 아이 기기, `myDeviceLearner`로 바인딩된 아이 로드) / **guardian**(구글 로그인 = 보호자, `#/family`로 이동). 예한이 기기는 세션이 없어 `getAuthUser`가 네트워크 없이 즉시 null → **기존 학습 흐름 완전 보존**.
  - [신규] **아이 연결 화면** `#/connect`(Connect.tsx): 부모(구글 로그인) / 아이(가족 코드 → 프로필 선택 → 익명 로그인 + wc_join_family). 기존 앱엔 이 화면으로 가는 버튼을 **의도적으로 넣지 않음**(예한이 학습 보존 + 아이 기기 오조작 방지) — 새 보호자·가족은 `#/connect` 링크로 진입(Dio님 결정 2026-07-23).
  - guardian 세션은 학습 세션·하트비트 미생성(보호자 열람 시간이 예한이 학습시간으로 잡히지 않도록 가드).
- **관제실 (아빠 앱)**
  - [신규] **가족 대시보드** (FamilyDashboard.tsx, `#/family`): 보호자 구글 로그인 후 진입. 가족 미가입 시 가족 코드로 guardian 연결(`joinFamily(code,'guardian',관계)`) → 가족 아이 목록 → 아이 선택 시 **그 아이의 관제실**(AdminPage에 learner 전달, PIN 생략).
  - [변경] AdminPage가 `{learner?, onExit?}` props 수용 — learner 주어지면 PIN 생략·헤더에 아이 이름·← 버튼. **레거시 `/admin` PIN 경로·집계 로직은 완전 불변**(props 없으면 종전과 동일).
- **연동 영향 (CONTRACT)**: **스키마·XP 산식·기록 방식 변경 0**. 신규 조회 헬퍼(supabase.ts: fetchLearnerById·myDeviceLearner·myFamilyLearners)와 Learner.family_id(옵셔널, additive)뿐. 계약 개정 불요(다가구 스키마 계약 v1.5는 Phase 3 RLS 후).
- **빌드·검증**: tsc 0에러 · `bun build --production`(L16) · main.js 328K/gzip 106KB. **playwright 렌더 스모크 6라우트**(`/ /connect /family /admin /review /profile`) — 전부 렌더 + 비-404 JS 런타임 에러 0. 신규 #/connect·#/family 정상, **레거시 예한이 흐름(#/·#/admin·#/review·#/profile) 비파괴 확인**.
- **배포 완료(7/23)**: Dio님 GitHub `JKDIO/wordcraft-app` 루트 드래그(main.js+version.json 2파일, content.json·app.css 불변) → Vercel 자동배포. **라이브 검증**: `version.json` 캐시버스터 = 1.4.7 확인 + 실제 Chrome에서 `#/connect` 화면 정상 렌더(백지 아님, JS 에러 0).
- **✅ 라이브 구글 로그인 왕복 검증 (2026-07-23, Dio님 폰)**: 배포된 앱에서 보호자 구글 로그인 → `#/family` → 가족코드 `YEHAN-7264`(관계 아빠) → **예한이 목록 등장 → 예한이 관제실(진도·정답률·복습·유령별) 정상 표시** 확인. 서버측 재현으로도 예한이(Lv.11·17,823XP) 반환 확인.
- **후속 DB 수정 2건 (재배포 불필요 — DB만 변경, 앱 코드 불변)**:
  1. `widen_memberships_relation_check_korean_labels` — `memberships.relation` 체크 제약이 영문('grandparent','mom','dad')만 허용 → 앱이 보내는 한글('아빠·엄마·할아버지·할머니') 거부(에러 23514, guardian 연결 실패)였음. 제약을 넓혀 한글 4종 추가(기존 영문·null 유지). additive.
  2. `extend_anon_open_policies_to_authenticated` — 앱 10개 테이블의 전면개방 RLS 정책이 **`{anon}` 역할 전용**이라 **로그인 세션(authenticated=보호자 구글/아이 익명)으로는 읽기·쓰기 불가** → guardian 연결(SECURITY DEFINER RPC)은 됐으나 직후 "내 가족·아이" 조회가 빈 결과로 화면이 안 넘어감. 정책 역할을 `anon,authenticated`로 확장(qual `true` 그대로). **이 정책들은 Phase 3에서 멤버십 기반 격리 정책으로 교체 예정.** ⚠️ 이 잠재결함은 아이 기기(익명 세션) 학습 기록에도 동일 영향이었을 것(수정으로 해소).
- **검증 한계 (정직 보고)**: ① 아이(device) 연결 흐름 실기기 미검증(서버 재현은 예정) · 실기기(갤럭시 A24 WebView) 미확인. ② Phase 3(RLS) 전이라 현재 정책은 anon+authenticated 전개방 — **가족 데이터 격리는 아직 없음**(다른 가족을 실제로 들이기 전 Phase 3 필수).
- **기록**: 로컬 SSOT = `_dev_github/src_v1.4.7/` + `wordcraft_src_v1.4.7.tgz`(tgz→클린빌드 main.js md5 `36ac102e…` 동일 검증). L20 동반 업로드로 이 릴리스에 RELEASE_LOG·START_HERE·소스 스냅샷을 GitHub `_dev_github/`에 동기화(밀린 v1.4.1~1.4.6 기록 유실 위험 해소). DB 마이그레이션 2건은 Supabase에 적용됨(apply_migration 원장 기록).

## v1.4.6 — 2026-07-18 (수정 동굴 음성 봉합 마무리 — 매치 게임 클립 재생)
- **결함(P0, 학습자 앱)**: 수정 동굴 '소리 쌍둥이' 매치 게임(`MatchGame.tsx`)이 타일 재생 시 `speak(p.tts)` 네이티브 TTS만 호출 → 예한이 폰 WebView에서 TTS 보이스가 비어 **조용히 실패**(무음). v1.4.5 라이브 계측 검증 중 발견(타일 클릭 → 클립 아닌 TTS 호출 확인).
- **수정**: `MatchGame`이 `playClip(p)`(audio_url 우선, 실패·부재 시 tts 폴백)로 재생하도록 변경. 매치 페어의 audio_url은 v1.4.5 content.json에 이미 주입돼 있어 **main.js·version.json 2파일만 재배포**(content.json 불변).
- **관제실**: 변경 없음.
- **검증(라이브 실측)**: R0 '소리 쌍둥이' 4개 타일(sea/no/sun/I) 클릭 → 각자 자기 클립(sea_see·no_know·sun_son·i_eye_nova.mp3) 재생, `playing`. tsc 0 · bun --production. (초고속 연타 시 2건 tts 폴백은 테스트 아티팩트 — 단일 탭은 클린.)
- **교훈**: 오디오 계약을 건드리는 작업은 **모든 재생 호출부를 전수 감사**해야 한다(L19). 한 컴포넌트만 playClip이고 나머지가 speak()면 무음이 남는다 — 자체 검증만으로 못 잡고 라이브 실측이 잡았다.

## v1.4.5 — 2026-07-18 (수정 동굴 무음 항목 전면 클립화)
- **검증 계기**: Dio님 지시 "수정동굴에서 소리가 안나는 문제들 전체 검증·수정". 진단 결과 — R0~R9 재생 항목 중 **`voice` 필드 없이 작성된 85개**(게임·퀴즈·speak·룬)가 build_content.py의 audio_url 주입 대상에서 빠져 네이티브 TTS로 폴백 → 폰 WebView에서 무음. (다른 월드 A~T는 애초에 클립 0 = 전부 TTS라 대비되어 수정 동굴에서만 "일부는 소리 나고 일부는 안 남"으로 체감.)
- **수정 ①(빌드)**: `build_content.py` inject에 `default_voice` 추가 — 수정 동굴(R*) 재생 항목은 voice 누락 시 **nova 기본 주입**(CONTRACT §9 'nova = 기본(단어·문장·미션)' 준수). 이미 audio_url 있으면 미덮어씀(룬 명시 주입 보존).
- **수정 ②(코드)**: `SpeakView`가 `speak()` 대신 `playClip()`으로 말하기 미션 음성 재생.
- **음원**: 빌드 후 매니페스트 400→475(신규 75개, 전부 nova 단어·최소대립쌍·미션문장 — 음소단독 없음). tts_clips 원장 insert + tts-batch 실행 → Storage 475/475 업로드, 누락 0·손상 0. content.json의 audio_url 475개 전부 Storage 존재 확인.
- **배포물**: main.js + content.json + version.json (콘텐츠 변경 → content.json 포함 3파일). `06_RELEASES/wc_upload_v1.4.5/`. 스냅샷 wordcraft_src_v1.4.5.tgz.
- **검증**: tsc 0 · bun --production · 로컬 playwright 계측(모든 R0 항목이 올바른 클립 URL로 Audio.play 호출 — 이전 무음 항목 sun/moon/sea,see/know/ship 포함). 라이브 실측: 학습카드 클립 6개 `playing`·tts 0.
- **남은 관련 항목(범위 밖·Dio님 판단)**: 복습 광산 `ReviewMine.tsx` 플래시카드 뒤집기도 `speak()` 네이티브 TTS-only. 다만 review_cards는 클라이언트 생성이라 audio_url이 없어 별도 시딩 설계 필요 — 수정 동굴 범위 밖이라 보류 보고.

## v1.4.4 — 2026-07-17 새벽 (간격 반복 정합 수정 — 같은 날 재채굴 차단 등 3건)
- **검증 계기**: Dio님 지시 "복습(간격 반복)이 현재 날짜에 맞게 작동하는지 상세 검증". 실데이터에서 이상 확인 — **7/16 복습 313회 / 실제 카드 158장 = 카드당 평균 1.98회** (같은 카드를 하루 ~2번 재채굴).
- **결함 ① (P0) 같은 날 재채굴 = 간격 반복 무력화 + XP 파밍**: ReviewMine이 카드 목록을 마운트 시 1회만 fetch → 채굴 후 "광산 입구로" 복귀 시 낡은 목록(옛 due)이 그대로 남아, 방금 맞힌 카드가 다시 '오늘 캘 카드'로 표시·재채굴 가능(+10 XP 반복). 수정: ① 입구 진입 시마다 서버 재조회(learnerId 지연 도착 시에도 재조회) ② "오늘 맞힌 카드" 로컬 기록(wordcraft_daily... → wordcraft_review_done_v1, KST 일 단위)으로 서버 반영이 늦어도 재출현 차단 — 2중 안전망. **오답 카드는 기록하지 않아 당일 리스폰(의도된 동작)은 보존.**
- **결함 ② review_count 미증가**: 채점 UPDATE에 review_count가 빠져 전부 0(START_HERE 잔여 확인사항이던 항목 — 원인 확정). 수정: 채점 시 +1. 과거 누락분은 소급하지 않음(0에서 시작 — 정직 기록).
- **결함 ③ 모듈 완료 카드 D+1 시드의 UTC 버그**: toISOString 기반이라 KST 00~09시에 모듈을 클리어하면 카드가 '내일'이 아닌 '당일' due로 시드됨. 수정: kstTomorrowStr(KST) 사용.
- **정상 확인(수정 불필요)**: 박스 주기(1=오늘/2=2일/4/7/14 — CONTRACT §1과 일치, 코드 주석만 낡아 정정) · 승급/강등(정답 +1칸·오답 박스1) · due 판정 KST 문자열 비교 · 오답 리스폰 W: 카드 · 박스5 상한 · 이중 채점에 의한 박스 과승급 없음(당시 낡은 box 기준이라 결과적으로 1칸만 이동 — DB 교정 불필요, 현 카드 분포 박스1=9·박스2=208 정합).
- **관제실**: 변경 없음. (복습 탭 review_count 지표는 v1.4.4부터 채워짐)
- **검증**: tsc 0에러 · --production · playwright 최악 조건 재현(서버가 계속 낡은 목록 반환) — 정답 2장 재출현 차단 ✓ / 오답 1장 당일 리스폰 ✓ / PATCH 4회에 review_count 포함 ✓ / JS 에러 0.
- **데이터 여파(정직 보고)**: 7/16~17 새벽의 중복 복습 XP(약 1,500~2,000)는 이미 지급된 그대로 둠(L17 — 회수 없음, 예한이 잘못 아님·설계 결함). 향후 데이터부터 정상.
- **배포물**: main.js + version.json — `06_RELEASES/wc_upload_v1.4.4/`. 스냅샷 wordcraft_src_v1.4.4.tgz.
- **배포 완료(7/17)**: Dio님 GitHub 드래그 커밋 → Vercel 자동 → 라이브 version.json 1.4.4(캐시버스터) + 실렌더 검증 통과. 같은 날 유령 첫 출몰(D+2 규칙) 라이브 배너·월드1 표시 확인.

## v1.4.3 — 2026-07-16 밤 (기기 간 동일 표시: 밸런스 게이지·출석 칩·오늘 학습분 서버 동기화)
- **현상 (Dio님 발견)**: 아빠 폰에 최신 앱을 깔아도 월드맵 상단 "오늘의 밸런스" 게이지가 안 보임 (예한이 폰에선 정상).
- **원인**: 게이지의 원천인 dailyXp(+주간 출석 칩 attendance, "오늘 n분" 활성시간)가 **localStorage(기기별 저장소)**에만 있었음. 게이지는 오늘 XP 합이 0이면 숨는 설계라, 학습 기록이 로컬에 없는 새 기기에선 항상 숨었다. 같은 계정이어도 기기마다 다르게 보이는 구조적 허점.
- **수정**: 앱 시작 시 `syncSharedDaily()`(store.ts 신설)가 서버에서 파생해 로컬과 병합 — ① 오늘의 밸런스: answer_events(오늘, KST) + 모듈/진단/유령 보너스 + 복습 콤보를 **관제실 xpOf와 1:1 산식**으로 계산 ② 주간 출석 칩: 최근 14일 sessions 일별 합 ≥15분 = 출석일(출석 계약 v1.2와 동일 기준), 로컬과 합집합 ③ 오늘 활성시간: 서버 세션 합이 로컬보다 크면 채택. 병합은 항목별 max/합집합이라 로컬 즉시 반영분 보존(L17 additive). repairStreak도 병합된 출석 이력을 쓰므로 더 정확해짐.
- **관제실**: 변경 없음 (읽기 전용 파생 추가 — 스키마·XP·기록 방식 불변).
- **검증**: tsc 0에러 · --production · playwright — 서버 REST를 모킹해 "빈 localStorage 새 기기" 재현: 게이지가 모험 185·복습 130으로 표시(기대 산식 정확 일치), 출석 칩·"오늘 출석 완료" 표시, JS 에러 0.
- **검증 한계**: 실기기(Dio님 폰) 최종 확인 필요. 오프라인 시작 시엔 종전처럼 로컬 기준(온라인 되면 다음 시작 때 동기화).
- **배포물**: main.js + version.json — `06_RELEASES/wc_upload_v1.4.3/`. 스냅샷 wordcraft_src_v1.4.3.tgz.

## v1.4.2 — 2026-07-16 밤 (소환진 정확성 수정: 문장 그대로 실행 + 버튼 배치)
- **버그 ① (Dio님 발견)**: 실험실에서 "The dog explodes" → 강아지 대신 폭탄몬이 소환돼 터짐 / "The cake eats ~" → 목적어와 무관하게 항상 미니 케이크를 먹음. 원인 = 시안 데모의 연출 편의(explode=붐붐 자동 소환, eat=고정 케이크 소품)가 본 게임에 그대로 포팅됨 — **"조립한 문장이 그대로 실행된다" 원칙 위반**. 수정 = explode는 문장의 주어가 직접 폭발 후 리스폰, eat은 목적어 배역을 먹잇감 스프라이트(축소 스케일+배역 팔레트 부스러기)로 렌더(목적어 없으면 기본 케이크 유지).
- **추가**: 대상 블록에 'the monster'(폭탄몬) 정식 추가 — 실험실 시도 사례 반영. (missions 콘텐츠 무변경)
- **버그 ②**: ⚡소환 버튼이 팔레트 아래에 있어 누른 뒤 무대까지 되감아 올라와야 애니메이션을 봄. 수정 = 버튼·피드백을 조립 슬롯 바로 아래로 이동(무대·슬롯·버튼·피드백이 한 화면), 블록 풀은 그 아래로.
- **관제실**: 변경 없음 (연동 영향 없음 — XP·스키마·콘텐츠 불변).
- **검증**: tsc 0에러 · --production 빌드 · playwright 계측 — The dog explodes=강아지 픽셀 확인(붐붐 아님) / The cake eats the dog=먹잇감이 강아지 팔레트 / hugs the monster=파트너 폭탄몬 / 자동사 eats=기본 케이크 / 레이아웃 slots(269)<버튼(283)<팔레트(349) / JS 에러 0. 스크린샷 2장 증거.
- **배포물**: main.js + version.json (app.css·content.json 변경 없음) — `06_RELEASES/wc_upload_v1.4.2/`. 스냅샷 wordcraft_src_v1.4.2.tgz.

## v1.4.1 — 2026-07-16 밤 (핫픽스: 듣기 이중 재생 + 라운드 뒤로가기)
- **버그 ① (Dio님 실기기 발견)**: 소리 훈련소 지령 미션에서 🔊 버튼을 누르면 남/여 목소리가 동시 재생. 원인 = `stopClip()`이 이전 오디오 엘리먼트의 src를 비울 때 error 이벤트가 발생 → **이전 문항의 tts 폴백(웹 TTS, 여성)이 오발동**하며 새 클립(echo, 남성)과 겹침. 수정 = 정지 전에 onerror/onplaying 핸들러 해제 + 재생이 시작된 클립은 늦은 에러여도 폴백 금지(started 플래그) + stopClip이 진행 중 폴백 TTS도 함께 정지(tts.ts에 stopSpeak 신설).
- **버그 ②**: 지령 미션·에코 사냥 라운드 및 유령 전투 화면에 나가기 버튼 부재. 수정 = 훈련소 메뉴/라운드·유령 전투 상단에 ← 뒤로가기 추가 (진도 손해 없음 — 이미 푼 문항 기록 유지).
- **관제실**: 변경 없음 (연동 영향 없음 — 코드/스키마/XP 불변).
- **검증**: tsc 0에러 · --production 빌드 · playwright — (a) 클립 성공 재현(로컬 mp3 라우트 주입) 상태에서 자동재생+연타 6회+문항 전환에도 TTS 폴백 발동 0회(이중 재생 회귀 없음) (b) 뒤로가기 3종(라운드→메뉴→월드맵, 유령 전투→월드맵) 동작 (c) JS 에러 0.
- **검증 한계**: 실기기(A24) 재확인 필요 — 특히 네이티브 TTS 폴백 경로의 정지(stopSpeak)는 WebView에서만 실동작 확인 가능.
- **배포물**: main.js + app.css + version.json (content.json 변경 없음) — `06_RELEASES/wc_upload_v1.4.1/`. 스냅샷 wordcraft_src_v1.4.1.tgz.

## v1.4.0 — 2026-07-16 저녁 (문장 소환진 🔮 오픈 — 시안 승인 즉시 구현)
- **배경**: v1.3.0 릴리스 직후 Dio님이 소환진 애니메이션 시안 v0.1을 **승인** → CONTRACT §12 확정(v1.4) 후 엔진 구현. v1.3.0이 아직 미배포 상태였으므로 **v1.4.0 하나로 모아서 1회 배포** (L1).
- **예한이 앱 (학습자)**
  - [신규] **월드 6 '문장 소환진 공방' 오픈** (#/forge): "조립한 문장이 그대로 실행된다" — 승인된 시안의 무대(배역 5종 픽셀아트 × 동사 12종 keyframe)를 forgeStage.ts로 포팅.
  - 모드 4종: 설계도 건축 I(주어+동사 12장) · II(대상·부사 확장 12장) · 딕토빌드(듣고 재조립 10, 음성 클립) · 소환 실험실(자유 조립).
  - **3단 피드백**: ①비문 = 소환 실패 파직 + 깨진 블록 하이라이트 + 헌법 조항 힌트(제1조 어순·제2조 주어·C7 왕관 -s) ②문법 OK·미션 불일치 = 애니메이션 **실행**(탐구 보상) + 내 문장 vs 미션 대조 카드 ③정답 = 미션 장면 + 골드 연출 + 풀 XP.
  - 부사가 실행 속도에 실제 반영(fast=1.7x, slowly=0.55x — Web Animations API, 미지원 시 무시). 새 문법 문장 발견 +2 XP(문장당 평생 1회, localStorage forgeFound).
- **관제실 (아빠 앱)**: xpOf에 forge_discover(+2) case, MODULE_NAMES FORGE, 활동 라벨 🔮소환진/문장 발견, FUTURE_WORLDS에서 월드 6 졸업.
- **연동 영향 (CONTRACT v1.3 → v1.4)**: §12 확정 — activity_type 'forge'(미션, module_id='FORGE') / 'forge_discover'(+2). 문법 검증 단일 원천 lib/forge.ts, 무대 단일 원천 lib/forgeStage.ts. DB 변경 없음, localStorage forgeFound 필드 추가(additive).
- **음원**: 딕토빌드 문장 10클립 추가 생성 — 누적 400/400 전량 ok(오류 0, 약 12MB).
- **빌드·검증**: tsc 0에러 · bun --production · playwright 스모크(소환진 미션 정답/비문/실험실 발견 + 월드맵 월드6 입구 렌더, JS 에러 0). 포팅 하네스 검증(jump/hug/speed/fail/success).
- **검증 한계 (정직 보고)**: 실기기 WebView에서 마법진 CSS(repeating-conic-gradient+mask)·getAnimations 미확인(데스크톱 chromium만) · 음원 청취 품질 미검증 · 예한이 실반응 미검증.
- **배포물**: main.js(324KB) + app.css(110KB) + content.json(854KB) + version.json — `06_RELEASES/wc_upload_v1.4.0/` (v1.3.0 내용 포함 — 이 4파일 1회 드래그로 두 릴리스가 함께 나감). 스냅샷 wordcraft_src_v1.4.0.tgz.

## v1.3.0 — 2026-07-16 오후 (2차 대확장: 유령 보스 · 수정 동굴 · 소리 훈련소 · 음원 파이프라인)
- **배경**: 7/16 기획 확정(`00_GOVERNANCE/기획_20260716_2차확장_승인.md`)에 따른 2차 학습 기능 확장. 예한이 진도 분석 결과 "장기기억 검증 0회" 해답 = 유령 보스. 개발 순서 P1~P7 준수, CONTRACT v1.3 선개정, DB는 L17 additive만.
- **예한이 앱 (학습자)**
  - [신규] **유령 보스 리매치 👻**: 모듈 클리어 D+2(첫 도전)·D+7(별<3 리매치)에 월드맵 완료 카드에 유령 출몰(동시 최대 3, 오래된 완료 순). 신규 응용 문항 9개(변형4·응용3·함정2, 총 162문항 — 기존 문항 재사용 0) 축약 보스전. 정답률 60/75/90% → ★~★★★, 통과 시 status='mastered'+최초 +50 XP(reason `ghost_boss`). 오답은 W: 리스폰 카드(기존 규칙). 보스 등장 대사 onyx 음성 클립.
  - [신규] **월드 1.5 수정 동굴 💎 (R0~R9, 10챕터)**: 발음기호(소리의 룬, GA 사전 표기) 마스터 과정. 정규 모듈, 잠금 = A4 클리어, 본선 진도 비차단. 입모양 SVG 15종(runeArt.ts), 룬 41종.
  - [신규] **룬 도감** (#/runes) · **소리 훈련소 🎧** (#/listen: 에코 사냥·지령 미션) · **진짜 음성 재생**(audio_url 우선+TTS 폴백) · 뱃지 17종째 `world1.5_clear`.
- **관제실 (아빠 앱)**: MODULE_NAMES R0~R9·ECHO·CMD, 활동 로그 'ghost' 라벨, 모듈 마스터리 👻별, XP 파생 유령 보너스(mastered_at 귀속 +50).
- **연동 영향 (CONTRACT v1.2 → v1.3)**: module_progress ADD `stars`·`mastered_at` · status 'mastered' · answer_events 'ghost' · xp_events 'ghost_boss' · 신규 tts_clips · Storage tts-audio · content.json ghost/listening. 기존 변경 0(L17).
- **음원 파이프라인**: Edge Function tts-batch v3, 클립 390개. 병렬 저작 18에이전트 + 교차검수 4팀(P0 253·P1 83 수정) + 외부 벤더 교차검증(영어 오류 0, IPA 정확).
- **빌드·검증**: tsc 0 · bun --production · playwright 스모크(7라우트+시드 인터랙티브), JS 에러 0.
- **검증 한계**: 생성 음원 청취 품질 미청취 · 실기기 오디오 미확인 · 예한이 실반응 미검증 · 라이브 배포 전 상태.
- **배포물**: main.js(297KB) + app.css + content.json(848KB) + version.json. 스냅샷 wordcraft_src_v1.3.0.tgz.

## v1.2.2 — 2026-07-16 오전 (출석 규칙 15분 기준 + 스트릭 오전 리셋 버그 수정)
- 스트릭 "어제"를 KST(kstYesterdayStr)로 봉합 + 출석 인정 = 하루 활성 학습 15분 이상(ATTENDANCE_MIN_SEC=900). 하트비트가 일일 활성시간 누적→15분 도달 시 markAttendance. 스트릭 자가복구(repairStreak).
- **연동 영향**: learners.streak_days·last_active_date 의미 = "마지막 출석일(15분 충족일)". 스키마 불변.
- **데이터 조치**: learners.streak_days 1→2 교정(양일 출석 충족 확인 후).
- **⚠️ 배포 사고와 재배포**: 1차 백지(TypeError, jsxDEV) → `bun build --production` 재빌드 + playwright 3화면 스모크 후 재배포. 다운타임 ~10분. → 교훈 L16 제정.
- **배포물**: main.js + version.json. 스냅샷 wordcraft_src_v1.2.2.tgz.

## v1.2.1 — 2026-07-15 밤 (관제실 업데이트 감지 배너 + 옛 배포 주소 은퇴)
- **관제실**: /version.json 25초 폴링 → 새 버전 시 상단 배너(location.reload) + 헤더 버전 표시.
- **인프라**: 옛 Vercel 프로젝트 'wordcraft'(eosin)에 리다이렉트 배포(해시 라우트 보존). 교훈 L15.
- **배포물**: main.js + app.css + version.json. 스냅샷 wordcraft_src_v1.2.1.tgz.

## v1.2.0 — 2026-07-15 저녁 (콘텐츠 대확장 + 복습 50:50 개편 + 뱃지 정합 전수 감사)
- **콘텐츠 8신규 챕터**(C7·B22a/b·D2S·D3S·T1~T3, 챕터당 38~42문항) 3중 검증.
- **예한이 앱**: 복습 +10/콤보+20 + 채굴 리포트 + 복습 answer_events 기록 · 오답 자동 리스폰(W: 카드) · 밸런스 미터 · 뱃지 도감/소급(syncBadges) · 재플레이 박스 보존.
- **관제실**: XP v2 동기화 · 밸런스 패널 · 신규 8모듈 별명 · 월드5 졸업 · 뱃지 16종.
- **연동 영향**: review_cards card_back · answer_events 'review' · XP 계약 v2.
- **데이터 조치**: 유실 뱃지 3종 소급 + 과거 오답 15문항 백필.
- **배포물**: main.js(275KB) + app.css(74KB) + content.json(430KB) + version.json.

## v1.1.0 — 2026-07-15 (이전 릴리스)
- **예한이 앱**: 유실 기능 재구성(정보 메뉴·스플래시 2종·네이티브 TTS·단일 content.json 로더) · 하트비트 사용시간 · 동기화 큐 레이스 봉합.
- **관제실**: v2 전면 개편(6탭·캘린더 히트맵·심층 분석·로드맵·뱃지 도감) · XP 산식 통일.
- **연동 영향**: sessions.duration 하트비트 · XP 규칙 준수 · 스키마 불변.
- **데이터 조치**: 7/15 세션 duration 백필, learners.xp=1290·level=3·streak=1 복원.

## v1.0.0 — 2026-07-15 오전 (이전 세션, deploy_v2)
- 정보 화면·자동 원격 업데이트·네이티브 TTS·스플래시 아이콘판.
- **사고 기록**: 이 릴리스의 소스가 노트북에 미반영 → 7/15 오후 관제실 v2 배포 때 기능 유실. 컴파일본에서 역추출 복원. → 철칙 2·3 제정 계기.

## (기록 소급) 2026-07-14 — 배포 파이프라인 + 콘텐츠 평탄화 + APK
- GitHub `JKDIO/wordcraft-app` + Vercel 자동배포 확립, content.json 평탄화, 스플래시 1차, APK(Capacitor, live URL — 웹 배포=폰 즉시 반영).

## (기록 소급) 2026-07-12 — v1 최초 배포
- 진단 4종 + 월드 1~4 + 관제실 v1 + Supabase 연동.
