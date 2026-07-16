# WordCraft 릴리스 로그 (RELEASE_LOG) — 단일 진실 원장

> **철칙 (2026-07-15 제정, Dio님 지시)**
> 1. **모든 배포는 이 파일에 기록한 뒤에만 한다.** 예한이 앱(학습자)과 관제실(아빠 앱)은 한 번들(main.js)이므로, 릴리스 항목은 **반드시 두 앱의 변경·영향을 함께** 적는다. 한쪽만 적힌 릴리스 기록은 불완전한 것으로 간주한다.
> 2. **소스 SSOT = 노트북 `03_APP/wordcraft/`.** 어떤 세션이든 코드를 바꾸면 배포 전에 노트북 소스에 먼저 반영한다. 클라우드 컨테이너에서만 고치고 배포하는 것 금지 (7/15 기능 유실 사고의 원인).
> 3. 배포할 때마다 `06_RELEASES/src_snapshots/v{버전}_{날짜}/`에 소스 전체 스냅샷을 남긴다.
> 4. `src/lib/version.ts`의 APP_VERSION과 `dist/version.json`의 version을 **같이 올린다** (다르면 정보 화면 업데이트 알림이 오작동).
> 5. 앱–DB 연동 규칙은 `03_APP/연동계약_CONTRACT.md`를 따른다. 스키마·XP 규칙·기록 방식을 바꾸면 계약 문서와 양쪽 앱 코드를 같은 릴리스에서 함께 수정한다.

---

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
  - [신규] **월드 1.5 수정 동굴 💎 (R0~R9, 10챕터)**: 발음기호(소리의 룬, GA 사전 표기) 마스터 과정 — ough 쇼(R0)→단모음/장모음/이중모음(R1~R3)→자음(R4~R6)→강세(R7)→블렌딩(R8)→최종 보스 "소리를 여는 자"(R9). 정규 모듈(진행·복습카드·보스 동일 규칙), 잠금 = A4 클리어, **본선(C0~) 진도 비차단**(R 모듈은 잠금 체인에서 건너뜀 + 진단 배정 자동해제 제외). 입모양 SVG 15종(runeArt.ts), 룬 41종.
  - [신규] **룬 도감** (#/runes): 완료된 R 챕터의 룬 수집·열람(입모양+예시 단어 음성).
  - [신규] **소리 훈련소 🎧** (#/listen): 에코 사냥(최소대립쌍 12세트 96문항, HVPT — 같은 단어를 nova/shimmer/alloy/echo 다중 음성으로) + 지령 미션(listen-and-do 40개, echo 음성). 하루 단위 결정적 로테이션 10문항 라운드.
  - [신규] **진짜 음성 재생**: 콘텐츠 audio_url(Storage 공개 클립) 우선 재생, 실패/부재 시 기존 네이티브 TTS 폴백(L8 안전). 듣기 문항에 🐢 천천히(0.75x) 토글.
  - [신규] 뱃지 17종째 `world1.5_clear`(💎 수정 동굴 정복 — 월드 클리어 템플릿 자동 정합).
- **관제실 (아빠 앱)**: MODULE_NAMES에 R0~R9·ECHO·CMD 추가, 활동 로그 'ghost' 라벨(👻유령)·보스 필터에 유령 포함, 모듈 마스터리에 👻별 표시, XP 파생에 유령 보너스 포함(mastered_at 귀속 +50 — 앱 reason `ghost_boss`와 1:1).
- **연동 영향 (CONTRACT v1.2 → v1.3)**: module_progress ADD COLUMN `stars`·`mastered_at`(additive) · status 'mastered' = 유령 통과 의미 확정 · answer_events 신규 activity_type 'ghost' · xp_events 신규 reason 'ghost_boss' · 신규 테이블 tts_clips(파이프라인 원장) · Storage 버킷 tts-audio(공개 읽기) · content.json에 ghost/listening 섹션 추가. **기존 행·컬럼·의미 변경 0 (L17)**.
- **음원 파이프라인 (P3)**: Edge Function `tts-batch` v3(자기 연쇄, gpt-4o-mini-tts→tts-1 폴백, 중복 스킵, tts_clips 원장) 배포. 클립 390개(nova156/echo64/shimmer69/alloy62/onyx18/fable21) 생성. 경로 규약 `tts-audio/<scope>/<slug>_<voice>.mp3`, audio_url은 build_content.py가 콘텐츠에 결정적 주입.
- **콘텐츠 품질 공정**: 병렬 저작 18에이전트 → 독립 교차 검수 4팀(P0 253건·P1 83건 수정 — 대부분 "엔진 tts 자동재생/버튼이 정답을 유출"하는 상호작용 결함과 듣기 문항 자동재생 트리거 누락) → 전역 정합 스캔(id 1,578개 중복 0) → **외부 벤더 교차 검증(OpenAI gpt-4o + Qwen): 영어 오류 0, IPA 사전 표기 정확** (지적 사항은 전부 표기 관행 차이 또는 의도적 오답 문장으로 판정).
- **문장 소환진 (P4)**: 애니메이션 시안 v0.1(배역 5종 픽셀아트 × 동사 12종 수제 keyframe + 3단 피드백 연출) 제작·Critic 스크린샷 검수 완료 → **Dio님 승인 게이트 대기. 승인 전 엔진 미구현·예한이 노출 없음** (계약 §12에 XP 규칙만 예약).
- **빌드·검증**: tsc 0에러, `bun build --production`(L16), playwright 스모크 — 정적 7라우트 + 시드 상태 인터랙티브(유령 출몰·전투·수정동굴 잠금해제·에코 라운드·입모양 아트) 렌더 확인, JS 에러 0.
- **검증 한계 (정직 보고)**: ① 생성 음원의 실제 청취 품질(장단 대비·강세·한국어 보스 대사) 미청취 — Dio님 샘플 청취 필요 ② 실기기(갤럭시 A24 WebView) 오디오 재생 미확인(폴백은 설계됨) ③ 예한이 실반응·체감 난이도 미검증 ④ 라이브 배포 전 상태(GitHub 업로드 = Dio님 드래그 대기).
- **배포물**: main.js(297KB) + app.css + content.json(848KB) + version.json — `06_RELEASES/wc_upload_v1.3.0/`. 소스 스냅샷 wordcraft_src_v1.3.0.tgz.

## v1.2.2 — 2026-07-16 오전 (출석 규칙 15분 기준 + 스트릭 오전 리셋 버그 수정)
- **배경**: 7/16 오전 예한이 학습 후 연속 출석일이 2일이 아닌 1일로 표시(달력은 정상). 원인 = touchStreak의 "어제" 계산이 toISOString(UTC) 기준이라 KST 오전 9시 이전 학습 시 어제가 이틀 전으로 계산돼 스트릭 리셋 (todayStr만 KST로 고친 R-10 봉합의 잔재). + Dio님 지시로 출석 인정 기준을 "하루 15분 이상 학습"으로 변경.
- **예한이 앱 (학습자)**
  - [수정] 스트릭 "어제"를 KST 기준으로 계산(kstYesterdayStr) — 오전 학습 시 리셋 버그 봉합
  - [변경] **출석 인정 = 하루 활성 학습 15분 이상** (ATTENDANCE_MIN_SEC=900). XP 획득 시 즉시 출석 처리하던 touchStreak 제거 → 30초 하트비트가 일일 활성시간(localStorage 별도 키 wordcraft_daily_active_v1, KST 일 단위) 누적, 15분 도달 순간 markAttendance(스트릭+출석 칩+learners 서버 반영)
  - [신규] 스트릭 자가 복구(repairStreak): 출석 이력(14일 캡 미달)으로 연속일 재계산해 과거 버그로 낮게 저장된 값 상향 교정 (앱 시작 시 1회)
  - [안내] 내 정보 스트릭 히어로에 15분 규칙 + 오늘 진행분 표시("오늘 n분 채굴 중 — m분만 더 캐면 출석 도장 쾅! ⛏️") · 월드맵 🔥칩 툴팁
- **관제실 (아빠 앱)**: 개요 타일 "연속 출석 (15분↑)" 라벨 + 기준 툴팁. 캘린더는 answer_events 파생 그대로(변경 없음)
- **연동 영향**: learners.streak_days·last_active_date의 의미가 "마지막 학습일" → **"마지막 출석일(15분 충족일)"**로 변경. learners 갱신 경로가 recordXp → markAttendance/repairStreak로 이동(xp·level은 recordXp가 계속 갱신). 스키마 변경 없음
- **데이터 조치(Supabase 직접)**: learners.streak_days 1→2 교정 (7/15 133분·7/16 42분 — 새 기준으로도 양일 출석 충족 확인 후)
- **검증 한계**: 15분 도달 순간의 실기기 동작은 예한이 오늘 세션에서 확인 필요(코드 경로는 tsc+빌드 검증). 오늘(7/16) 출석은 구버전이 이미 인정한 것을 유지(소급 회수 없음)
- **배포물**: main.js + version.json (app.css·content.json 변경 없음) / 소스 스냅샷 wordcraft_src_v1.2.2.tgz
- **⚠️ 배포 사고와 재배포 (같은 날 오전)**: 1차 main.js가 라이브에서 화면 백지(TypeError: U is not a function). 원인 = 이 세션 컨테이너의 bun 1.3.13은 `NODE_ENV=production`+`--define`만으로는 JSX를 production 런타임으로 전환하지 않음 → jsxDEV(개발용)로 컴파일됐고 react production 번들에선 jsxDEV가 undefined. **`bun build --production`으로 재빌드** 후 playwright 헤드리스로 3개 화면(월드맵·관제실·내정보) 렌더 스모크 테스트 통과 확인하고 재배포, 라이브 검증 완료(관제실 v1.2.2·🔥2, 학습자 2일 연속). 다운타임 약 10분. → 교훈 L16 제정: 배포 전 번들 스모크 테스트 의무 + bun --production 명시.

## v1.2.1 — 2026-07-15 밤 (관제실 업데이트 감지 배너 + 옛 배포 주소 은퇴)
- **배경**: v1.2.0 배포 후 Dio님 폰이 구버전으로 보임 → 원인 2개 발견. ① 오래 열려 있던 관제실 탭은 새 코드를 스스로 불러오지 않음(학습자 앱과 달리 업데이트 알림 장치 부재) ② 7/12 옛 배포(wordcraft-eosin.vercel.app, Vercel 프로젝트 'wordcraft')가 살아 있어 옛 APK/북마크가 구버전을 계속 서빙받음.
- **관제실 (아빠 앱)**: /version.json을 25초 주기로 확인 → 새 버전이면 상단에 "🔄 새 버전 도착! 누르면 업데이트" 배너(location.reload). 헤더에 현재 버전 v표시 추가.
- **예한이 앱**: 변경 없음 (기존 정보 탭 업데이트 체계 그대로).
- **인프라**: 옛 Vercel 프로젝트 'wordcraft'(eosin 도메인)에 리다이렉트 페이지 배포(MCP 직접 배포, 해시 라우트 보존 location.replace) → 옛 주소 접속 시 wordcraft-app으로 자동 이동. 라이브 확인 완료.
- **배포물**: main.js + app.css + version.json (content.json 변경 없음) / 소스 스냅샷 wordcraft_src_v1.2.1.tgz
- **연동 영향**: 없음(읽기 전용 버전 체크). 교훈: 옛 배포 URL은 반드시 은퇴(리다이렉트) 처리 — LESSONS L15.

## v1.2.0 — 2026-07-15 저녁 (콘텐츠 대확장 + 복습 50:50 개편 + 뱃지 정합 전수 감사)
- **배포물**: main.js(275KB) + app.css(74KB) + **content.json(430KB — 신규 8모듈 포함)** + version.json / GitHub `JKDIO/wordcraft-app` → Vercel
- **소스 스냅샷**: `06_RELEASES/src_snapshots/wordcraft_src_v1.2.0.tgz` / GitHub `_dev_github/wordcraft_src_v1.2.0.tgz`
- **콘텐츠 (8개 신규 챕터, 챕터당 채점 문항 38~42개 = 기존의 ~2배)**
  - 문법 성 +C7 '일반동사 행동 부대' (3단현 -s·don't/doesn't·Do/Does — GIU Basic 선행, C5/C6과 점층 연결)
  - 동사 사냥터 +B22a(이동·행동 동사 20)·+B22b(생각·감정 동사 12 + 구동사 8 — 중학 선행)
  - 생존 캠프 +D2S '미국 상륙 작전'(식당·가게·계산대 실전)·+D3S '미국 친구 사귀기 대작전'(또래 스몰토크·뉘앙스) — 미국 실사용 표현, 점층 난이도
  - **월드 5 '시제 시간여행' 정식 오픈**: T1 과거로 GO!·T2 미래로 GO!·T3 지금 이 순간, LIVE! (중1 선행)
  - 전 문항 3중 검증: 구조 검증기(validate.js) + 의미 검수(정답 인덱스·영어 자연성·뉘앙스) + 결함 15건 수정 완료
- **예한이 앱 (학습자)**
  - [복습 개편] 복습 정답 +5→**+10 XP** + 하루 10장마다 **콤보 +20** + 채굴 완료 리포트 · 복습 답변을 answer_events(activity 'review')로 기록 시작(기존 미기록 버그 봉합)
  - [신규] **오답 자동 리스폰**: 월드에서 틀린 모든 문제(quiz/boss/choice/listen/order)가 즉시 복습 카드(W:모듈:문항)로 광산에 추가 (과거 오답 15건 DB 백필 완료)
  - [신규] 월드맵 '오늘의 밸런스' 미터(모험 vs 복습 XP, 50:50 목표) + 복습 배너 버튼화(예상 XP 표시)
  - [신규] 뱃지 도감: 잠긴 뱃지 탭 → 획득 조건+진행도 공개 · 신규 뱃지 5종(2주 무정지·견습 광부·전설의 광부·황금 밸런스·시간의 지배자)
  - [수정] 뱃지 판정을 lib/badges.ts로 일원화 + **앱 시작 시 소급 지급(syncBadges)** — 풀 스캔 미지급 버그 근본 봉합(진단 이력을 서버 progress에서도 복원) · 보스 승리 이력 서버 복원
  - [수정] 모듈 재플레이 시 복습 카드 박스가 1로 리셋되던 결함 → ignore-duplicates upsert로 성취 보존
- **관제실 (아빠 앱)**
  - XP 산식 v2 동기화(복습 10 + 콤보 — 복습 이벤트는 v1.2.0부터 존재하므로 소급 불일치 없음) · 복습 탭 '학습 밸런스' 패널(오늘/이번 주 모험:복습)
  - 신규 8모듈 한글 별명 · 월드5 로드맵 졸업(FUTURE_WORLDS 6~10만 유지) · 뱃지 도감 16종+미획득 조건 표시 · 퍼펙트 뱃지가 진단 100%로 오인되던 파생 버그 수정
- **연동 영향**: review_cards에 card_back 컬럼 추가(마이그레이션 적용됨) · answer_events에 activity_type 'review' 신설 · XP 계약 v2 — CONTRACT v1.1 참조
- **데이터 조치(Supabase 직접)**: 유실 뱃지 3종 소급 지급(first_module·diag_all·boss_slayer) + 과거 오답 15문항 복습 카드 백필
- **검증**: tsc 통과 · 전 모듈 구조 검증 통과 · Playwright 렌더 12장면(월드 6·타일 18·뱃지 공개·관제실 6탭·신규 모듈 로드) 통과 · 배포 후 라이브 검증 예정

## v1.1.0 — 2026-07-15 (이전 릴리스)
- **배포물**: main.js(260KB) + app.css(70KB) + version.json / GitHub `JKDIO/wordcraft-app` → Vercel 자동배포
- **소스 스냅샷**: `06_RELEASES/src_snapshots/v1.1.0_20260715/`
- **예한이 앱 (학습자)**
  - [복구] 7/15 오전 유실됐던 기능 전부 소스로 재구성: ℹ️ **정보 메뉴**(아빠의 메시지 + 버전/원격 업데이트), **스플래시 2종**(광산 모험/관제실), **네이티브 TTS**(Capacitor, APK 소리 문제 해결), **단일 content.json 로더**(챕터 이름 정상화)
  - [신규] 사용시간 기록 체계: 30초 하트비트 + 백그라운드 전환 시 확정 기록 (기존: pagehide 의존 → 모바일에서 시간 유실)
  - [수정] 동기화 큐 레이스 봉합 — XP·뱃지·복습카드가 서버에서 사라지던 근본 원인
- **관제실 (아빠 앱)**
  - [신규] v2 전면 개편: 탭 6개(개요/활동/복습/분석/진행/보상), 학습 캘린더 히트맵, 오답만 필터, 복습 성취 상세, 심층 분석(취약영역·유형별·반응속도·반복오답·마스터리), 향후 월드 5~10 로드맵, 뱃지 도감(데이터 파생)
  - [수정] XP 산식을 예한이 앱(StepRunner)과 동일하게 통일 → "오늘 XP=누적 XP"(같은 날) 일치. 학습시간은 세션과 활동로그 중 큰 값(구버전 기기에도 정확)
- **연동 영향**: sessions.duration 기록 방식 변경(하트비트) — 관제실 집계와 짝 맞춤 / XP 규칙 계약 준수 / 스키마 변경 없음
- **데이터 조치(Supabase 직접)**: 7/15 세션 duration 백필, learners.xp=1290·level=3·streak=1 복원
- **검증**: tsc 통과, 컨테이너 Playwright 렌더 확인(월드맵 챕터명·정보화면·내비 4버튼), 배포 후 라이브 확인 예정

## v1.0.0 — 2026-07-15 오전 (이전 세션, deploy_v2)
- 정보 화면(아빠 메시지+버전) 추가, 자동 원격 업데이트 체크, 네이티브 TTS, 스플래시 아이콘판
- **사고 기록**: 이 릴리스의 소스가 노트북에 반영되지 않음 → 7/15 오후 관제실 v2 배포 때 기능 유실 발생. 컴파일본(deploy_v2/main.js)에서 역추출로 복원. → 철칙 2·3 제정 계기

## (기록 소급) 2026-07-14 — 배포 파이프라인 + 콘텐츠 평탄화 + APK
- GitHub `JKDIO/wordcraft-app` + Vercel 자동배포 확립, content.json 평탄화, 스플래시 1차(CSS판), APK(Capacitor, live URL 방식 — **예한이 폰은 라이브 사이트를 직접 로드**하므로 웹 배포=폰 즉시 반영)

## (기록 소급) 2026-07-12 — v1 최초 배포
- 진단 4종 + 월드 1~4 + 관제실 v1 + Supabase 연동
