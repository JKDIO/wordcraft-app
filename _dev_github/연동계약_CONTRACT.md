# WordCraft 연동 계약 (CONTRACT) v1.6 — 예한이 앱 ↔ 관제실 ↔ Supabase
(2026-07-15 제정 v1.0 → v1.1 → v1.2(출석) → v1.3(§8 유령 보스 · §9 오디오 · §10 리스닝 · §11 수정 동굴) → v1.4(§12 문장 소환진) → 2026-08-12 v1.4.16에서 v1.5(§13 단어 대륙 신설 + XP v4) → **2026-08-13 v1.4.19~v1.4.21에서 v1.6: §2 XP v5(단어 골렘) · §3 뱃지 v3(36종·단일 규칙) · §13 확장(워드몬·이야기·분류 상자·속사 사냥·골렘) · §14 관제실 정합 규약 신설**. 노트북 원본: `03_APP/연동계약_CONTRACT.md`)

> 예한이 앱(학습자)과 관제실(아빠 앱)은 **한 번들(main.js)의 두 얼굴**이다.
> 이 계약을 바꾸는 릴리스는 **반드시 양쪽 코드를 같은 릴리스에서 함께 수정**하고, RELEASE_LOG에 두 앱의 변경·영향을 같이 기록한다. 한쪽만 기록된 릴리스는 불완전한 것으로 간주한다. (Dio님 지시, 2026-07-15)
> **v1.3의 모든 변경은 L17 무손실 원칙(additive만)을 따른다** — 신규 컬럼·신규 값·신규 테이블뿐이며 기존 행·컬럼·의미 변경 없음.

## 1. 데이터 계약 (Supabase: gbynvzxgbpmoqdsriowz)
| 테이블 | 쓰는 쪽 | 읽는 쪽 | 핵심 규칙 |
|---|---|---|---|
| learners | 예한이 앱(xp·level·streak·last_active), 관제실(admin_pin 읽기) | 양쪽 | xp는 아래 XP 계약으로만 증가. **streak_days·last_active_date = "마지막 출석일(15분 충족일)" — §5 출석 계약(v1.2)** |
| sessions | 예한이 앱 | 관제실 | 시작 시 INSERT → **30초 하트비트로 duration_seconds 갱신** + 백그라운드 전환/pagehide 시 ended_at 확정. 관제실은 duration 합 vs answer_events 간격합(<5분) 중 **큰 값** 표시 |
| answer_events | 예한이 앱 (문항 단위, session_id 연결) | 관제실 (모든 분석의 원천) | response_ms 상한 120초. **절대 삭제 금지**. v1.2.0부터 복습 답변도 기록(activity_type='review'). **v1.3.0부터 유령 보스 답변도 기록(activity_type='ghost', module_id=해당 모듈, question_id=G-<모듈>-<n>)** |
| module_progress | 예한이 앱 | 관제실 | completed 시 completed_at·total_time_seconds 기록. 진단은 module_id='DIAG-D1'~'DIAG-D4'. **v1.3 신규 컬럼(additive): `stars smallint`(유령 보스 별, null=미도전) · `mastered_at timestamptz`(최초 마스터 시각). status 'mastered' = 유령 보스 통과(★1 이상)** |
| review_cards | 예한이 앱 (라이트너 5칸) | 관제실 (복습 탭) | box 1~5. 카드 2종(모듈 정규 + 오답 리스폰 W:모듈:문항id) — 유령 보스·리스닝 오답도 동일하게 W: 리스폰 |
| xp_events, badges | 예한이 앱 | 관제실 (보조) | 관제실 표시는 answer_events **파생 계산이 기준**. v1.3 신규 reason: `ghost_boss`(유령 보스 최초 통과 +50) · `forge_mission`/`forge_discover`(소환진, §12 예약) |
| parent_rewards | 관제실 | 관제실 | 1,000 XP 마일스톤 지급 기록 |
| **tts_clips (v1.3 신규)** | tts-batch Edge Function | 파이프라인 관리용 (앱 미사용) | 클립 생성 원장: path·voice·text·status·bytes·error. 앱은 이 테이블을 읽지 않고 Storage public URL만 사용 |

## 2. XP 계약 v5 (양쪽 동일 산식 — 어기면 "오늘 XP ≠ 누적 XP" 재발)
- 원천: `src/lib/xp.ts` + StepRunner/ReviewMine/GhostBattle/ListenArcade/**VocabContinent** emit 규칙. 관제실 `xpOf()`/`moduleBonus()`/`comboBonusOf()`는 1:1.
- **★v1.6 구조 변경 — 산식은 이제 한 곳에만 산다★**: `src/lib/xp.ts`의 **`answerXpOf(activity_type, is_correct)`** 와 **`moduleBonusOf(module_id, best_score)`** 가 유일한 정의다. 관제실(`AdminPage.xpOf`/`moduleBonus`)과 기기 병합(`store.xpOfEvent`/`syncSharedDaily`)은 **이 두 함수를 호출만** 한다.
  - 왜 바꿨나: v1.4.16에서 ②③을 빠뜨려 어휘 XP가 2배로 잡혔고(같은 릴리스에서 봉합), **v1.4.17의 그 봉합이 v1.4.18 소스 복구 때 통째로 유실돼 v1.4.19까지 라이브에서 다시 부풀어 있었다**(L27). 복사본이 없으면 복사본이 사라질 일도 없다.
  - **자동 검사 의무**: 배포 전 `bash verify.sh` — 소비자 파일에 산식 복사본이 되살아나면 실패하고, 앱 부여값 vs 관제실 파생값을 팩·골렘 실전 시뮬레이션으로 대조한다.
- 문항: 정답 10 (quiz·boss·**ghost**·game_choice·game_listen_choice·game_order) / **game_match 15 (정오답 무관)** / **speak 10 (항상)** / 복습 정답 10 / diagnostic 0 / **어휘 정답 5 (activity_type='vocab' — 문항 수가 많아 낮게)**
- 보너스: 모듈 클리어 +50 · 진단 완료 +30 · 복습 콤보 +20(하루 10장마다) · **유령 보스 최초 통과 +50 (reason='ghost_boss', 모듈당 1회 — 관제실 파생 = mastered_at 있는 모듈 × 50)** · **어휘 팩 클리어 +30, ★★★(정답률 90%↑)면 +15 추가**
- **모듈 보너스 분기 규칙(단일 함수 `moduleBonusOf`)**: `DIAG-*` → 30 / `V<티어>-<번호>`(`^V\d{1,2}-\d{2}$`) → 30(+90%↑면 15) / **`GOLEM-T<티어>-<번호>`(`^GOLEM-T\d{1,2}-\d$`) → 40 (v1.4.20 신설, reason=`vocab_golem`)** / 그 외 → 50
- **속사 사냥은 XP·answer_events에 기록하지 않는다(v1.4.20 의도적 결정)** — 속도 게임을 점수에 넣으면 관제실 정답률이 오염되고 아이가 '급하게 찍기'를 보상받는다.
- **리스닝 아케이드**: module_id='ECHO'(에코 사냥)·'CMD'(지령 미션), activity_type='game_listen_choice' → 정답 +10 기존 산식 그대로 (관제실 코드 변경 불필요, MODULE_NAMES 별명만 추가)
- 학습 밸런스(50:50): 유령 보스·리스닝은 **모험** 측으로 분류(activity_type≠'review')
- XP 규칙 변경 시 **`xp.ts` 한 곳만** 수정한다. 이미터(App/화면)는 상수를 참조하고, 관제실·기기병합은 함수를 호출한다. 변경 후 `bash verify.sh` 필수.

## 3. 뱃지 계약 v3 (v1.4.21 개편 — 17종 → **36종**, 판정 규칙 단일화)
- **단일 원천**: `src/lib/badges.ts`. 규칙은 **`earnedFrom(facts: BadgeFacts)` 하나**뿐이다.
  - 앱은 `factsFromLocal(LocalState)`로, 관제실은 서버 행(module_progress·answer_events·review_cards·learners)으로 **각자 사실만 만들고** 규칙은 같은 함수를 쓴다.
  - 왜: v1.4.20까지 판정이 badges.ts와 AdminPage 두 곳에 복사돼 있었다. 한쪽만 고치면 "아이 화면엔 있는데 관제실엔 없는" 뱃지가 생긴다(L27과 같은 사고 유형).
  - **수호자 수처럼 파생되는 값은 facts에 넣지 않고 `earnedFrom` 안에서 직접 센다** — 호출자가 빠뜨리면 그 뱃지가 조용히 영영 안 나오기 때문이다(실제로 검사에서 걸렸다).
- **분야 5종**: 모험(12) · 꾸준함(4) · 복습·기억(5) · 단어 대륙(9) · 수호자와 보스(6). 앱·관제실 모두 분야별로 끊어 표시한다.
- **v1.4.21 신규 19종**
  | id | 조건 |
  |---|---|
  | `vocab_first` / `vocab_10` / `vocab_50` / `vocab_100` / `vocab_200` | 정복 구역 1 / 10 / 50 / 100 / 200 |
  | `vocab_perfect_5` / `vocab_perfect_25` | ★★★(90%↑) 구역 5 / 25 |
  | `guardian_first` / `guardian_5` / `guardian_all` | 수호자 완전 각성 1 / 5 / 10명 (한 티어 20팩 = 1명) |
  | `golem_first` / `golem_10` / `golem_all` | 단어 골렘 격파 1 / 10 / 40 |
  | `wordmon_legend_10` / `wordmon_legend_50` | 👑전설(라이트너 박스 5) 워드몬 10 / 50마리 |
  | `sort_perfect_5` ※localOnly | 분류 상자 전부 정답 5회 |
  | `rapid_20` ※localOnly | 속사 사냥 한 판 20마리 |
  | `rune_5` | 수정 동굴 룬 챕터 5개 완료 |
  | `forge_20` | 소환진에서 문장 20개 발견 |
- **localOnly 뱃지**: 서버 이벤트로 되짚을 수 없는 것(분류 만점 횟수·속사 최고 기록). 앱이 `LocalState`(`sortPerfect`·`rapidBest`)로 판정하고, 관제실은 **badges 테이블 값으로만** 본다. 관제실 파생에서는 해당 facts를 0으로 둔다.
- **LocalState 추가 필드(v1.4.21, L17 additive)**: `legendWords: string[]` · `sortPerfect: number` · `rapidBest: number`. 없으면 기본값으로 채워지므로 구버전 하위호환.
- **검사 의무**: `node badge_check.mjs`(verify.sh에 포함) — 규칙 복사본 부활 감시 · 정의↔규칙 id 집합 일치(오타로 영영 못 받는 뱃지 방지) · 경계값(한 칸 모자라면 안 나오고 딱 맞으면 나온다) · 아무것도 안 했을 때 0개.

## 4. 버전 계약 (변경 없음)
- APP_VERSION == version.json (항상 함께 올림). 예한이 폰 APK는 server.url 방식 — 웹 배포 = 폰 즉시 반영.

## 5. 출석 계약 (v1.2 — 변경 없음)
- 출석 인정 = KST 하루 활성 학습 15분 이상. learners.streak_days·last_active_date = "마지막 출석일". "어제"는 반드시 KST(kstYesterdayStr).

## 5-1. 세션 규약 (변경 없음)
- 관제실 접속은 학습 세션 미생성. 하트비트 델타 2분 초과분 버림.

## 6. 콘텐츠 계약 (v1.3 보강)
- 배포 콘텐츠는 단일 `/content.json` = modules + diagnostics + **v1.3 신규 섹션: `ghost`(유령 보스) + `listening`(에코 사냥·지령 미션) + (R0~R9는 modules에 정규 모듈로 포함)**.
- **기존 모듈의 문항 id·card_id 불변.** 유령 보스 문항은 전부 신규 id `G-<모듈>-<nn>` (기존 문항 재사용 금지 — 전이 측정 원칙).
- 월드/순서: content.ts WORLDS·MODULE_ORDER 단일 원천. **v1.3: 월드 1.5 '수정 동굴'(R0~R9)을 A4와 C0 사이에 삽입** — 기존 모듈 진행·잠금에 영향 없음(완료 모듈은 그대로 done). 관제실 MODULE_NAMES에 R0~R9·ECHO·CMD 별명 추가.
- 신규 챕터 분량 기준: 채점 유닛 35~45개, review_cards 12장, boss 8문항(+meme).

## 7. 배포 규약 (L11·L16 — 변경 없음)
1. 소스 SSOT = 노트북 → 컨테이너 빌드. 2. RELEASE_LOG 선기록. 3. `bun build --production` + playwright 렌더 스모크 의무. 4. 배포물 GitHub 업로드 → Vercel. 5. 스냅샷 + 라이브 검증 + 기록 3종.

---

## 8. 유령 보스 계약 (v1.3 신설)
- **출현**: module_progress.completed_at 기준 **KST D+2 이상 경과 && stars가 null** → 월드맵 완료 카드에 👻. **리매치**: mastered 후 stars<3 && mastered_at 기준 D+7 경과 → 👻 재출현(별 상향 도전).
- **전투**: 축약 보스전 8~10문항(2~4분), 콘텐츠는 content.json `ghost[module_id]`. 문항 3계단 = ①변형 ②응용(두 규칙 결합) ③함정(한국어 화자 오류). 진도 비차단, 오답=리스폰(W: 카드), 감점 없음.
- **판정**: 정답률 60%↑=★, 75%↑=★★, 90%↑=★★★, 60% 미만=통과 실패(언제든 재도전, 기록은 answer_events에 남음).
- **기록**: 통과 시 module_progress upsert — status='mastered', stars=max(기존, 이번)(하향 없음), mastered_at은 최초 통과 시 1회만. XP: 문항 정답 +10(activity_type='ghost') + 최초 통과 보너스 +50(reason='ghost_boss').
- **관제실**: 진행 탭에 👻별(stars) 표시, 누적 XP 파생에 mastered 보너스 포함, 활동 로그 activity_type 'ghost' 라벨 '👻유령'.
- **음성**: 보스 대사 = onyx (공용 대사 클립, §9).

## 9. 오디오 자산 계약 (v1.3 신설)
- **저장소**: Supabase Storage 공개 버킷 `tts-audio` (읽기 public, 쓰기 service role만).
- **경로 규약**: `tts-audio/<scope>/<slug>_<voice>.mp3` — scope = 모듈 id(R1 등)·'echo'·'cmd'·'ghost'·'common'. slug = 텍스트 정규화(소문자 영숫자+언더스코어, 40자 이내) + 충돌 시 짧은 해시.
- **생성**: Edge Function `tts-batch`(OpenAI gpt-4o-mini-tts, 실패 시 tts-1 폴백, OPENAI_API_KEY secret) — 재시도·중복 스킵·tts_clips 원장 기록. 호출은 SQL(pg_net) 또는 서비스 호출로만.
- **음성 배정 (Dio님 필수 지시)**: | nova | 기본 — 안내·단어·문장·미션 | / | echo | 지령 미션·아빠 대결 계열 | / | onyx | 유령 보스 전용 | / | fable | 수정 동굴 룬 수호자 한정 | / | shimmer·alloy | 에코 사냥 HVPT 다양화 |
- **앱 재생 규약(L8 안전)**: 콘텐츠 항목의 `audio_url`(public URL)을 표준 HTMLAudioElement로 재생. **실패·부재 시 기존 네이티브 TTS(`tts` 텍스트)로 자동 폴백** — 오디오가 없어도 학습은 항상 가능. 듣기 항목에는 0.75x 배속 토글(playbackRate).
- **정직 한계**: 발음기호 "음소 단독" 음원은 TTS 부적합 → 단어 내 강조 방식 사용(수정 동굴은 예시 단어 오디오로 학습).

## 10. 리스닝 아케이드 계약 (v1.3 신설)
- content.json `listening.echo_sets`(최소대립쌍 HVPT — 같은 단어를 nova/shimmer/alloy/echo 다중 음성으로) + `listening.commands`(listen-and-do, echo 음성, 이모지 행동 선택).
- 기록: module_id 'ECHO'/'CMD', activity_type='game_listen_choice', question_id=콘텐츠 id (전역 유일 ECHO-nnn/CMD-nnn). 오답 → W: 리스폰 카드. 세션·XP·밸런스 기존 규칙 그대로.
- UI: 월드맵 "🎧 소리 훈련소" 진입 → 에코 사냥 / 지령 미션. 15~20문항 단위 라운드.

## 11. 수정 동굴 계약 (v1.3 신설)
- R0~R9 = **정규 모듈** (module_progress·review_cards·boss·XP 전부 기존 규칙). world=1.5, 잠금 해제 = A4(월드 1) 클리어.
- 모듈 JSON 추가 필드(additive): 최상위 `runes[]`(음소 룬 도감 항목: ipa·name_ko·example·tip_ko·art_key), learn 카드 `art_key`(입모양 SVG — src/lib/runeArt.ts 단일 원천), 항목별 `voice`/`audio_url`.
- 룬 도감(RuneDex): 완료된 R 모듈의 runes 수집 표시 (별도 테이블 없음 — module_progress 파생).
- 표기: 사전 표기(GA) 우선. 룬 수호자 대사 = fable.

## 12. 문장 소환진 계약 (v1.4 확정 — Dio님 시안 승인 2026-07-16)
- 위치: 월드 6 '문장 소환진 공방' 입구(모듈 아님) → `#/forge`. 모드 3종: 설계도 건축 I(kernel 12)·II(expand 12) / 딕토빌드(10, 음성 클립) / 소환 실험실(자유 조립).
- **XP**: 미션 첫 시도 성공 +10 (answer_events activity_type='forge', module_id='FORGE', question_id=미션 id) / **새 문법 문장 발견 +2 (activity_type='forge_discover', 정규화 문장당 평생 1회 — localStorage forgeFound)**. 관제실 xpOf: 'forge'=기본 산식(정답 10), 'forge_discover'=항상 2 — ForgeScreen과 1:1.
- **3단 피드백**: ①비문 = 소환 실패 연출 + 깨진 블록 하이라이트 + 헌법 조항 힌트(제1조 어순·제2조 주어·C7 왕관 -s) ②문법 OK·미션 불일치 = **애니메이션 실행**(탐구 보상, 신규 문장이면 +2) + 내 문장 vs 미션 문장 대조 카드 ③정답 = 미션 장면 + 풀 XP.
- 문법 검증 단일 원천 = `src/lib/forge.ts`(SUBJECTS/VERBS/OBJECTS/ADVERBS + validate). 애니메이션 단일 원천 = `src/lib/forgeStage.ts`(승인된 시안 v0.1 포팅 — 배역 5종 × 동사 12종). 부사(fast/slowly)는 애니메이션 재생 속도에 실제 반영.
- 오답 리스폰 카드 미생성(소환진 자체가 재도전 루프), 진단·복습과 무관. 밸런스 분류 = 모험.
- 콘텐츠: `04_CONTENT/forge/missions.json` (content.json `forge` 섹션으로 번들, 딕토빌드는 §9 오디오 규약).

## 13. 단어 대륙 계약 (v1.5 신설 — 2026-08-12 v1.4.16)
- **정체**: 어휘 엔진. 월드가 아니라 **별도 대륙**(`#/vocab`)이며 기존 월드·모듈·유령·소환진의 진행/잠금에 **아무 영향을 주지 않는다**.
- **규모**: 10티어 × 20팩 × 12단어 = **2,400단어**. GIU Basic 전체 + 중학 전 과정 커버.
- **데이터**: 루트 `/vocab.json`(약 1.44MB, **지연 로드** — 대륙에 들어갈 때만 받는다). content.json과 **분리**한다(앱 시작 부담을 늘리지 않기 위해).
  - 구조 `{ version, audio_ready, tiers[10], packs{200} }`
  - 팩 `{ pack_id:'V3-07', tier, theme_ko, title_ko, emoji, intro_ko, words[12] }`
  - 단어 `{ w, ko, pos, ipa, ex, ex_ko, hint_ko, distractors[3], tags, tts, audio_url, audio_ex_url }`
- **DB 스키마 변경 0 (L17 순수 additive)**
  - 팩 진도 → 기존 `module_progress`에 `module_id='V3-07'` 형태. status/best_score/completed_at 기존 의미 그대로.
  - 문항 → 기존 `answer_events`, `activity_type='vocab'`, `question_id='<pack_id>:<단어>:<모드>'`.
  - 복습 → 기존 `review_cards`, `card_id='vocab:<단어>'`, `card_front=단어`, `card_back='<뜻>\n<예문>'`.
  - XP → 기존 `xp_events`, reason `vocab_correct`(5) · `vocab_pack`(30) · `vocab_perfect`(15).
- **잠금 규칙**: 티어 1 항상 열림 / 티어 N은 티어 N-1을 **80%(16/20)** 정복 시 개방 / 팩은 미완료 중 **앞 3개가 동시에** 열림(강제 순서가 아니라 선택 — 자기결정이론).
- **세션 4단계**: ① 사전 스캔(12단어를 아이가 "알아요/몰라요"로 직접 분류 — 아는 단어는 학습·문항에서 제외하고 복습 박스 3부터 시작) → ② 학습 카드(모르는 단어만) → ③ 게임 5종 교차(뜻 사냥·소리 낚시·문장 구멍·철자 대장간·한→영 소환, 모르는 단어 2문항/아는 단어 1문항, **최대 28문항**) → ④ 결과(별점 = 90/70 기준, 기존 모듈과 동일).
- **문항 생성 단일 원천** = `src/lib/vocab.ts`. 화면 = `src/screens/VocabContinent.tsx`.
  - **오답 출처 규칙**: 뜻 사냥(영→한)은 **같은 팩의 다른 단어 뜻**에서, 나머지(한→영·듣기·빈칸)는 콘텐츠의 `distractors[3]`에서.
  - **셔플 규칙(L24)**: 선택지 셔플은 xorshift 상위 비트를 쓴다. LCG 하위 비트 금지 — 정답 위치가 몰려 아이가 내용 대신 위치를 외운다. 문항 생성 코드를 바꾸면 **정답 위치 분포를 전수 계측**하고 4지선다 각 위치 25%±2%p를 확인한다.
- **오디오**: 단어 클립 `audio_url`, 예문 클립 `audio_ex_url`. 경로 = `tts-audio/vocab/<slug>_<sha1앞6>_nova.mp3` (§9 slug 규약과 동일, voice 전부 nova). 시딩기 = Edge Function **`vocab-seed`**(라이브 vocab.json을 읽어 서버에서 경로 산출 — 목록이 모델 문맥을 통과하지 않게. 실행 전 `{"dry":true}`로 sha256을 컨테이너 계산값과 **교차 검증**할 것).
  - ⚠️ **콘텐츠의 `ex`를 고치면 예문 클립 경로가 바뀐다.** 검수·수정 후에는 반드시 `vocab-seed` 재실행 → `tts-batch` → **파형 재감사**(L22)까지 하고 배포한다.
- **입구 스위치**: 월드맵 배너는 `version.json`의 **`vocab_ready`가 true일 때만** 노출된다. 음원 파형 감사(L22) PASS 전에는 false로 둔다 — **앱 재배포 없이 서버에서 여닫는다.**
- **관제실**: `xpOf`에 `case 'vocab'`, `moduleBonus`에 팩 분기, 활동 로그 라벨 `🗺️단어 <pack_id>`, 모듈 이름은 표가 아니라 규칙(`moduleName()`)으로 생성(팩이 200개라 표에 넣지 않는다).
- **밸런스 분류**: 어휘는 **모험(course)** 측. 팩을 끝내면 12단어가 복습 카드로 들어가므로 복습량은 자동으로 따라 늘어난다.
- **뱃지**: v1.5 범위 외(추가 시 badges.ts + AdminPage + LocalState 카운터를 같은 릴리스에서).

### 13-A. 단어 대륙 확장 (v1.4.19~v1.4.21)
- **워드몬(v1.4.19)**: `review_cards.box` 1~5를 **진화 단계**로 다시 읽는다(🥚알→🐣아기→🦖성체→⚡각성→👑전설). **간격 반복 주기·스키마 모두 불변** — 바뀐 것은 보여주는 방식뿐. 단어 도감 `#/dex`는 `card_id like 'vocab:%'` 파생(새 테이블 0).
- **이야기(v1.4.20)**: `vocab.json` version 3. 팩에 `outro_ko`(2문장)·`guardian_ko`(1문장) 추가, 티어에 `guardian{name_ko,name_en,emoji,look_ko,meet_ko,awaken_ko[5],golem{...}}` 추가, 최상위 `story{title_ko,villain_ko,intro_ko,role_ko}` 추가. **전부 additive** — 구버전 앱이 읽어도 무시된다.
  - 수호자 각성 = 그 티어 정복 팩 수 ÷ 5 (0~4단계). 기존 잠금 규칙에 얹었을 뿐 새 진행 개념 없음.
- **분류 상자(v1.4.20)**: 문항이 아니라 **한 화면 활동**. 12칩을 품사(또는 음절 수) 상자에 나눠 담는다. 채점은 칩 1개 = `answer_events` 1행(`activity_type='vocab'`, `question_id='<pack>:<단어>:sort'`). 분류가 붙는 팩은 문항 상한을 28 → **20**으로 줄인다(세션 15~20분 예산 유지).
- **속사 사냥(v1.4.20)**: 45초 선택형 유창성 라운드. **기록·XP 없음**(위 §2). 짝 비율은 확률이 아니라 **정확히 7/12로 고정**한다 — 확률에 맡기면 어떤 팩은 ⭕만 연타하는 게 최적 전략이 된다(L24의 재판).
- **단어 골렘(v1.4.20)**: 티어당 4회(팩 5개마다), 전체 40회. 직전 5팩 60단어에서 12개(팩당 균등). **틀리면 큐 맨 뒤로 돌아오는 완전 학습 — 실패 없음.** 자기 채점 모드(`speak`)는 제외. 길을 막지 않지만 잡아야 수호자가 다음 단계로 깨어난다.
- **해금 곡선(v1.4.20)**: 기준을 티어 → **누적 정복 팩 수**로 변경. 0팩 뜻사냥·소리낚시·철자대장간 / 1팩 한→영 소환 / 2팩 분류 상자 / 3팩 속사 사냥 / 4팩 소리 지르기 / 6팩 문장 구멍. (티어 기준이면 T2까지 16팩 동안 3가지만 보게 된다.)
- **입력 방식 계약(L26)**: 문항 모드는 **손이 하는 행동**으로 분류한다 — 고르기(탭)/조립/말하기/분류. 한 단어의 두 문항은 반드시 서로 다른 분류에서 뽑는다. 문항 생성 코드를 바꾸면 **전 콘텐츠 전수 계측**하고 티어별로도 확인한다(초반 구간이 나빠지는 것을 평균이 가린다).

## 14. 관제실 정합 규약 (v1.6 신설 — v1.4.21)
> `module_progress`와 `answer_events`에는 **세 종류가 섞여 들어온다**: 학습 모듈 · 진단(`DIAG-*`) · 어휘 팩(`V*-*`)/단어 골렘(`GOLEM-T*-*`).
> 이것을 거르지 않으면 관제실 숫자가 조용히 거짓이 된다. 실제로 v1.4.20까지 **"모듈 클리어 27/28"** 처럼 어휘 팩이 모듈 진도에 합산되고 있었다.

- **단일 판별 함수**: `AdminPage.isLearnModuleId(id)` = 진단·어휘 팩·골렘이 **아닌** 것. 모듈 지표는 전부 이걸로 거른다.
- **거르는 지표**: 모듈 클리어 수(전체 진행률) · 취약 영역(개념별 정답률) · 반복 오답 목록 · 모듈 마스터리 · 월드 진행.
- **어휘는 따로 보여준다**: 진행 탭 **🗺️ 단어 대륙 패널** — 정복 구역/200 · ★★★ 구역 · 어휘 정답률 · 골렘 격파/40 · 깨어난 수호자/10 · 👑전설 워드몬 · **워드몬 진화 분포(어휘 카드만)** · **티어 10줄(진도·수호자 각성 아이콘·골렘 격파/출현)** · 어휘 취약 구역 TOP 5. 분석 탭에는 **어휘 반복 오답**을 별도 블록으로 둔다.
- **이름 생성은 표가 아니라 규칙으로**: 팩 200개·골렘 40개를 `MODULE_NAMES` 표에 넣지 않는다. `moduleName()`이 `V3-07` → `🗺️ 단어 대륙 T3-7구역`, `GOLEM-T3-2` → `⚔️ 단어 골렘 T3 #2`로 만든다.
- **티어 이름·수호자는 관제실에 복사하지 않는다** — `loadVocab()`으로 `vocab.json`(단일 진실)에서 지연 로드한다.
- **활동 유형 라벨**: `vocab` → `🗺️단어 대륙`. 새 `activity_type`을 만들면 `typeLabel` 맵에 반드시 추가한다(없으면 원문 문자열이 그대로 노출된다).
- **정합 점검 의무**: 앱에 새 기록 종류(module_id 규칙 / activity_type / review_card 접두사)를 추가하는 릴리스는 **같은 릴리스에서** ① 모듈 지표가 오염되지 않는지 ② 관제실에 그 기능을 볼 자리가 있는지 두 가지를 함께 확인한다.
