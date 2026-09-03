# 🚩 START HERE — WordCraft 개발 현황 (새 세션 최초 필독)

> **현재 상태 스탬프 → 라이브 v1.4.30 · 소스 v1.4.30 (2026-08-14, 라이브 SHA 대조 완료). ★뱃지 도감 기본 접힘 + '열기 ▼' 강조★**
>
> **v1.4.30 = 🏆 뱃지 도감이 열자마자 접혀 있다 (Dio님 지시)**
>  ① **기본값 전환**: 옛 규칙 "하나라도 딴 카테고리는 펼침"(v1.4.27~29) → **11개 카테고리 전부 접힘**. 뱃지 71종이 되면서 옛 규칙이 내 정보 화면을 수백 줄로 늘려 놓았다. 이제 ⚔️ 룬 장비창(한 그림)이 먼저, 세부는 **아이가 골라 연다**.
>  ② **여는 버튼 강조**: 11px·불투명도 .55짜리 `▼` → **금색으로 채운 '열기 ▼' 알약**(56×26, weight 900, 금색 글로우). 열리면 조용한 테두리 '닫기 ▲'로 물러나므로 **열린 줄이 어디인지도** 한눈에 보인다. `전체 펼치기`는 📂 칩 버튼으로 승격.
>  ③ **관제실은 그대로 둔다** — 아빠 화면은 훑어보는 것이 목적. **규칙이 두 앱에서 갈라진 첫 사례**이므로 기억할 것.
>  ④ **배포물 2종만**(`main.js`+`version.json`). `app.css` 변경 0 — 새 클래스 없이 **인라인 스타일**로만 처리했다(app.css 크기 불일치 이월 과제를 건드리지 않기 위해).
>  ⑤ **검사 보강**: `badge_ui_smoke.mjs`에 ①전부 닫힘(`data-wc-open=0`) ②기본 카드 0 ③알약이 실제로 칠해지고 56×26 이상 — 3개 판정 신설. 옛 기본값을 되살리면 즉시 실패(L27④ 확인).
>  ⑥ ⚠️ **함께 바로잡음**: 노트북 저장소 루트 `content.json`이 **v1.4.23판으로 낡아 있었다**(라이브·GitHub·tgz는 v1.4.26판). 라이브와 동일한 파일로 덮었다. → **L32 제정: 로컬 사본도 진실이 아니다, 진실은 라이브 바이트(SHA)다.**
>
> **v1.4.29 = ★★복습 광산이 "오늘 캘 카드 0"이라 거짓말하고 있었다 — P0 봉합★★**
>  ① **증상**: 하단 뱃지는 40, 광산 화면은 0. 원인 = 광산이 카드 전체를 **정렬 없는 `limit=500`**으로 받아 그 안에서 due를 골랐고, 예한이 카드가 **685장**이 되자 due 40장이 창 밖으로 밀렸다. **그중 38장이 그날 틀려서 리스폰된 오답 카드** — 앱의 약속이 조용히 깨져 있었다.
>  ② **수정**: `src/lib/review.ts` 신설 = 조회 규칙 단일 원천. due는 **서버가 거른다**(`due_date=lte.오늘 & order & limit=2000`), 층별 "N장"은 별도 경량 조회, **뱃지와 광산이 같은 함수(`minableCards`)를 통과**한다.
>  ③ **일반화(Dio님 지시 "다시는")**: `db.select` **30곳 전수 감사** → 같은 병 **15곳**(상한 없음 9 · 정렬 없음 6) 동시 수정. 관제실 포함.
>  ④ **검사 2종 신설**: `review_check.mjs`(가짜 PostgREST로 685장 재현 — 뱃지 수 = 광산 수) · `query_check.mjs`(모든 조회에 상한·정렬 강제) + `review_smoke.mjs`(실브라우저). **결함을 되살려 잡히는 것까지 확인**(L27④). **L31 제정.**
>  ⑤ ⚠️ **v1.4.28은 이때까지 라이브에 없었다.** 이 문서가 "라이브 v1.4.28"이라고 적고 있었지만 GitHub·라이브 번들 어디에도 없었다(grep `loadout` 0건). **문서가 틀렸고 진실 3종이 맞았다(L25).** v1.4.29 배포에 함께 나갔다 — 그래서 배포물에 `app.css`도 포함된다.
>
> **v1.4.28 = ★⚔️ 룬 장비창★ — 뱃지 71종을 '한 그림'으로**
>  ① 뱃지 40→**71종**, 카테고리 **11개**(성격별), 접기/펴기. 분포 5~9로 균형(정복만 14로 몰려 있던 것을 각 과목으로 재배치).
>  ② **장비창의 확장 규칙**: 뱃지 1개 = 그림 조각 1개로 만들지 않는다. **카테고리 = 장비 슬롯**, 슬롯은 달성률로 5등급. 뱃지가 200개가 돼도 그림은 그대로 — **새 카테고리가 생길 때만 `LOADOUT_SLOTS`에 한 줄 추가**한다.
>  ③ 규칙 단일 원천 = `src/lib/loadout.ts`. 그리기 = `src/screens/BadgeLoadout.tsx`. **캔버스·SVG 금지(WebView, L8)** — box-shadow 픽셀 + CSS만.
>  ④ 검사 = `badge_check.mjs`(71개 판정·경계값) + **`badge_ui_smoke.mjs`(신설 — 카테고리·접기/펴기·장비창 실렌더)**.
>
> **v1.4.24 = ★문장 소환진 해체 → 문법 22단원에 녹임★ + ★월드 7~10 적대적 검증·수정★**
>  ① **월드 6(문장 소환진 공방)과 `#/forge` 화면을 삭제**했다. 소환은 이제 문법 단원의 `summon` 스텝(모듈당 3문항, 총 66문항)이다. 자리 = **마지막 quiz 바로 앞**. 저작 규격 = `claude/저작규격_문장소환_SUMMON_SPEC.md`
>  ② **두 회귀를 고쳤다.** ⚡소환 버튼을 조립 슬롯 바로 아래로(블록 창고는 그 아래) · `The cake explodes`면 케이크가 터지고 `The dog eats the cat`이면 고양이를 먹는다. **원인은 v1.4.6 소스 재구성 때 v1.4.2 수정이 v1.4.0판으로 되돌아간 것**(md5로 18개 버전 대조해 확정) — L29 제정.
>  ③ **재현 불가능한 문장에는 거짓 애니메이션을 붙이지 않는다.** 무대 배역(5)·동작(12) 밖의 문장(시제·문장결합·회화)은 **'문장 각인'** 연출(`engrave`)로 간다. 66문항 중 무대 재현 10 · 문장 각인 56.
>  ④ **월드 7~10 적대적 검증** — 독립 검수관 4명이 24모듈 전수 감사 → **4개 월드 전부 "내보낼 수 없음"**. P0 24건 · P1 45건 수정 완료(비문·틀린 형태론·복수정답·앱에 없는 녹음 기능 요구·월드9 규격 역주행 등). 재검증 후 기계 검증 **오류 0 · 경고 0**.
>  ⑤ **검사 신설**: `summon_check.mjs`(콘텐츠 전수 — answer 분해 경로 유일성·scene↔문장 일치) · `summon_smoke.mjs`(실브라우저 계측 — 레이아웃 좌표 71문항·문장↔애니메이션 15문항·합성 픽스처 5). **결함을 되살려 잡히는 것까지 확인**했다(L27④·L29).
> **(v1.4.23)** 월드 7~10 선행 개발 24모듈 — `worlds_ready` 스위치로 비노출 유지
> **(v1.4.22)** 보상 로드맵 / **(v1.4.21)** 뱃지 36종 / **(v1.4.20)** 단어 대륙 확장
>
> ✅ **월드 7~10은 열렸다(`worlds_ready: true`, v1.4.26).** 음원 1,085개 생성 → 재생 항목 3,751개 전부 음원 보유(무음 0) → **파형 전수 감사 1,882클립 결함 0** → 개방. 월드 정복 뱃지 4종도 함께 추가(36→40종).
> ⚠️ **감사에서 불량 1건을 잡았다** — 11단어 문장이 18.2초·peak 0.05로 절대 기준을 0.0005 차이로 통과했다. 재생성으로 해결했고, **이번부터 분포 상대 기준(중앙값 1/4)과 단어당 재생시간을 함께 본다**(L22 보강).
> ⚠️ **배포 절차(필수)**: `bash verify.sh` → 빌드 → `bash verify.sh`(버전 3자 대조) → **렌더 스모크 6종**(`review_smoke` · `badge_ui_smoke` · `reward_smoke` · `summon_smoke` · `w710_smoke` · `routes20`; dist는 8099, 소환 하니스는 8098 로컬 서버 필요) → 배포 → 라이브 SHA·번들 grep 대조
> ⚠️ **소환 스모크 하니스 재생성법**(tgz에 없다): `.verify/summon_items.json` = content.json의 모든 `type:'summon'` 스텝 items를 펼친 배열(66개) · `.verify/summon_entry.tsx` = `SummonExercise`를 `items={[ITEMS[n]]}`로 렌더하고 `globalThis.__go(n)`을 노출하는 하니스 + `.verify/out/index.html`(app.css 링크).
> ⚠️ 소스 SSOT = 노트북 `_dev_github/src_v1.4.30/`(+ tgz). 콘텐츠 SSOT = `wordcraft_content_v1.4.26.json`(v1.4.27~28은 코드만 변경)(+ 월드7~10 원본 `wordcraft_content_w710_src_v1.4.24.tgz`). 어휘 SSOT = `wordcraft_vocab_v1.4.20.json`. 계약 = `연동계약_CONTRACT_v1.7.md`.

> ## 🚩 2026-09-03 — 이 문서보다 먼저 볼 것
> **스탬프는 `00_START_HERE_스탬프_최신.md`(2026-09-03 갱신), 이번 릴리스는 `RELEASE_v1.4.47.md`.**
> 라이브는 **v1.4.46**, 준비된 것은 **v1.4.47**(빌드·검증 완료 · **배포 미실행**).
> 저장소는 **https://github.com/JKDIO/wordcraft-app** 다. 아래 "지금 최우선" 9~12번은 대부분 해소됐다 — 취소선을 볼 것.
> ⚠️ 노트북에서 검사·빌드를 돌리려면 `tsc` 를 **5.x** 로 고정해야 한다(7.x 는 거짓 오류 17건 — D47-12).

## ⚡ 지금 최우선 (2026-08-14~)
0. **★예한이 폰에서 뱃지 도감 확인 (v1.4.30)★** — 내 정보를 열었을 때 ① 11줄이 전부 접혀 있는가 ② 금색 '열기 ▼' 알약이 **손가락으로 정확히 눌리는가**(A24 실기기) ③ 접힌 목록이 아이에게 "볼 게 없다"로 읽히지는 않는가. **이게 최종 판정이다.**
1. **★★예한이 폰에서 복습 광산 40장 확인 (v1.4.29 P0)★★** — 앱을 다시 열어 하단 뱃지 숫자와 광산의 "오늘 캘 카드"가 **같은 숫자**인지, 채굴이 실제로 시작되는지. 잘려 있던 40장(38장은 오답 리스폰)이 그대로 남아 있다. **이게 최종 판정이다.**
1-1. **★예한이 실기기(A24) 확인★** — 월드 7~10이 열렸다. ① 새 월드 4개가 폰에서 보이는가 ② P1 첫 팩에서 소리가 나는가 ③ 🔮 문장 소환이 손에 맞는가 ④ 15~20분에 몇 스텝을 하는가. **이게 최종 판정이다.**
2. **★예한이 실사용 확인 — 🔮 문장 소환 + ⚔️ 룬 장비창★** (장비창은 마법진 회전·픽셀 92개 렌더가 A24에서 버벅이지 않는지도 함께)
2-1. **원래 항목:** — ① 버튼이 손에 닿는 자리인가 ② 조립한 문장과 화면이 같은가 ③ '문장 각인' 연출이 캐릭터 없이도 납득되는가 ④ 3문항이 지루하지 않은가. **이게 최종 판정이다.**
3. **월드 7~10 독립 재검증** — P0/P1을 고친 것은 각 월드의 검수관 본인이다. 저작·검수에 관여하지 않은 에이전트의 재검수가 아직 없다.
4. **보상 로드맵 실사용 확인** — 관제실 🎁 탭에서 보상 2~3개 등록 → 예한이 폰에서 확인.
5. **남은 콘텐츠 과제(정직 보고)** — ① 월드 7 P4의 담화표지 훈련이 실질 접속사 대응 암기(모듈 절반 재설계 필요) ② 월드 10 결합 문항 54.5%에서 정지 ③ 월드 8 형태론은 저작자=검수자였다 ④ 월드 8 W1의 교차복습 2문항이 '이전 모듈' 복습이 아님.
6. **가족 기능** — 진영이네 부모 실제 로그인 왕복(아직 guardians=0).
7. **데이터 정리(Dio님 승인 필요)** — 준비 완료, 미실행. `앱개발/데이터정리_승인대기_20260813.md`.
8. **이월 과제** — `public/app.css`↔배포본 크기 불일치 · PWA 서비스워커 · v1.4.15 재생성 클립 11개 청취 확인 · 정답 위치 4번째 칸 하한 근접(어휘 23.54% / 월드7~10 22.48%) · 과거 XP 소급 보정(하지 않기로 함).
9. ~~**★신규(2026-08-29) — 쓰기(자유 작문) 채점기★**~~ **→ 2026-09-03 v1.4.47 로 구현·검증 완료(배포 대기)**. 옛 내용: **★쓰기 채점기, 코딩 단계에서 반드시 구현★** UI/UX 목업 단계에서 설계·검증까지 완료. **Dio님 지시: "Claude Code 이관 때 적용해줘"** — 이 항목을 빠뜨리면 안 됨. 실행 시스템 프롬프트 전문·5개 샘플 채점 검증 결과·파일럿 운영안(2주 감사 모드→정상 모드 전환)은 `콘텐츠_20260829_읽기쓰기_1차착수_ABC.md` §C에 있음. 구현 시 반드시: ① 채점 호출은 Claude Sonnet이 아니라 Codex/OpenRouter T1~T2 레인으로(정량 상한 준수) ② XP·판정 로그는 관제실에서 조회 가능하게(감사 모드 요구사항) ③ `answer_events`에 결과 기록 시 기존 스키마 additive 원칙(L17) 준수.
10. ~~**★신규(2026-08-29) — 기사 갤러리 장비 오버레이 파이프라인★**~~ **→ 2026-09-03 24장 본 생산 완료**(`RELEASE_v1.4.47.md` §4). 규격은 오버레이 문서 **v2.0 §12**가 정본(v1.3 유실, 896×1200 채택). 옛 내용: `저작규격_기사갤러리_오버레이파이프라인_v1.md`(v1.4) 참고. 3차 테스트에서 `fal-ai/nano-banana-pro/edit`(fal의 `run_model` 도구 경유, `edit_image` 래퍼는 실패함 — 입력 형식이 `{"prompt":..., "image_urls":[...]}`)로 뿔·로고·화풍 3개 P0 기준 전부 통과. 본 생산(24~29장, 6슬롯×4등급) 착수 시 이 모델을 기본으로 채택할 것.
11. **★신규(2026-08-29) — 실제 라이브 자산 `hero/helm3.png`(뿔 투구) 결함 수정·배포 완료★** `저작규격_기사스프라이트_HERO_SPEC.md`(v1.1)와 `결함대장_DEFECT_LEDGER_v1.md`(D0829-1) 참고. 앞으로 헬멧·투구류 자산 제작 시 negative prompt에 `horns, horned helmet, devil horns, demon horns`를 반드시 포함할 것(신앙 기준, Dio님 절대 요구사항).
12. ~~**★신규(2026-08-29) — 읽기·쓰기 콘텐츠 공백★**~~ **→ 2026-09-03 이야기 서고(월드 10) 12모듈로 해소**(지문 18·4지선다 72·자유작문 12, `writing_ready` 스위치로 닫아 둠). 옛 내용: `콘텐츠_20260829_읽기쓰기_1차착수_ABC.md` 참고. A(문단독해)·B(빈칸채우기)는 실제 vocab.json 단어 기반 샘플까지 나왔고 Dio님 확인 대기 중. 확정되면 각 티어(elem-core~ms3+)별 실제 문항 대량 제작이 필요.

## 🔮 문장 소환 구조 (v1.4.24 — 새 세션 필독)
- **독립 화면이 아니다.** `content.json`의 각 모듈 `steps` 안에 `{"type":"summon", "prompt_ko":…, "items":[3개]}`로 들어간다. 자리는 **마지막 quiz 바로 앞**.
- 코드: `src/engine/SummonExercise.tsx`(스텝 UI) + `src/lib/forge.ts`(문법 검증·어휘) + `src/lib/forgeStage.ts`(무대·애니메이션). `StepRunner`가 `kind:'summon'`으로 렌더한다.
- **레이아웃은 고정이다**: 무대 → 조립 슬롯 → **⚡소환 버튼** → 피드백 → 블록 창고. **버튼을 창고 아래로 내리면 `summon_smoke.mjs`가 실패한다.**
- **`scene`이 있으면 무대가 그 문장을 그대로 연기한다.** actor(5) × verb(12) × object × speed. **문장과 어긋나면 `summon_check.mjs`가 실패한다.** 재현 불가능하면 `scene`을 **빼야** 하고, 그러면 `engrave`(문장 각인)로 간다.
- 기록: `activity_type='forge'`(v1.4.0과 동일), `question_id=<모듈>-SM-n`. 발견 시 `forge_discover`(+2 XP) → 뱃지 `forge_20`. **스키마 변경 0.**
- **★커리큘럼 확장 규칙(Dio님 지시)★**: 앞으로 **문법을 다루는 새 단원을 만들면 `summon` 스텝을 반드시 함께 넣는다.** 파닉스·형태론·발음 단원은 제외(문장 조립이 학습 목표와 어긋난다).

## 🔒 월드 7~10 숨김 구조 (새 세션 필독 — 실수로 열면 안 된다)
- 기준선 `WORLDS`(6개) · `MODULE_ORDER`(28개)는 **절대 건드리지 않는다.** 신규는 `EXT_WORLDS`(4개) · `EXT_MODULE_ORDER`(24개)에 따로 있다.
- 화면은 **접근자만** 쓴다: `worldList(ready)` · `moduleOrder(ready)` · `isExtModule(id)`. `ready`는 `version.json.worlds_ready`에서 온다(App → WorldMap·Profile prop).
- 그냥 이어붙이면 예한이 화면의 "클리어 28/28"이 조용히 "28/52"가 된다. 아이 입장에서 그건 자기가 한 일이 반토막 나는 경험이다 — 그래서 이렇게까지 한다.
- 여는 순서: **음원 파형 감사 PASS → Dio님 승인 → `version.json`의 `worlds_ready: true` 배포(앱 재배포 불필요).**

## 🎁 보상 로드맵 구조 (v1.4.22 — 새 세션 필독)
- 테이블 `reward_goals`: `learner_id · threshold_xp(유니크) · title · emoji · note · granted_at`. **기존 `parent_rewards`는 지급 이력으로 계속 산다**(지급 시 양쪽에 기록).
- 규칙 = `src/lib/rewards.ts` **단일 원천**. `buildRewardView(goals, totalXp)` → 정렬·도달·남은 XP·**구간 진행률(직전 목표 기준)**·next·pending. 소비자 파일에서 `threshold_xp`를 직접 비교하면 `reward_check.mjs`가 실패한다.
- 아이 노출 2곳(둘 다 필수): 하단 네비 `🎁 보상` 탭 + 월드맵 상단 스트립. 보상 0개면 스트립은 **그리지 않는다**.
- 관제실: 보상 탭에서 추가/수정/삭제/지급/지급취소. 입력 중 "남은 XP · 지금 페이스면 약 N일" 표시(표본 3일 미만이면 말하지 않는다).
- XP를 **소비하지 않는다**. 뱃지·레벨·잠금과 무관한 순수 표시 계층.

## 🗺️ 단어 대륙 구조 (새 세션 필독)
- 데이터: 루트 `/vocab.json`(1.44MB, 지연 로드). `{version, audio_ready, tiers[10], packs{200}}`. 팩 = `{pack_id:'V3-07', tier, theme_ko, title_ko, emoji, intro_ko, words[12]}`. 단어 = `{w, ko, pos, ipa, ex, ex_ko, hint_ko, distractors[3], tags, tts, audio_url, audio_ex_url}`.
- 코드: `src/lib/vocab.ts`(잠금 규칙·문항 생성·셔플·복습 시드) + `src/screens/VocabContinent.tsx`(지도 + 세션 4단계).
- 잠금: 티어1 항상 열림 / 티어N은 N-1을 80%(16/20) 정복 시 / 팩은 미완료 중 앞 3개가 동시에 열림(자율성).
- 기록: `answer_events.activity_type='vocab'`, `module_id=<pack_id>`, xp reason `vocab_correct(+5)`·`vocab_pack(+30)`·`vocab_perfect(+15)`. 복습 카드 `card_id='vocab:<단어>'`. **스키마 변경 0**.
- 음원: 단어 `audio_url`, 예문 `audio_ex_url`. 경로 = `vocab/<slug>_<sha1앞6>_nova.mp3`. **시딩기 = Edge Function `vocab-seed`**(dry-run으로 sha256 교차검증 후 실행).
- ⚠️ **콘텐츠를 고치면 예문 클립 경로가 바뀐다** — 반드시 `vocab-seed` 재실행 → `tts-batch` → **파형 재감사**까지 하고 배포할 것.

## 0. ⚠️ 이 문서는 낡을 수 있다 — 신뢰 순서 (먼저 읽기)
이 문서는 **"지도 + 마지막 세션 스냅샷"**이다. 위 스탬프가 실제와 다르면 이 문서가 낡은 것.
**낡지 않는 진실:**
1. **프로젝트 메모리 `RELEASE_LOG.md`** (append-only, 맨 위=최신 = **v1.4.30**).
2. 라이브 `https://wordcraft-app.vercel.app/version.json` (캐시버스터 `?cb=...` 필수). 현재 **1.4.30**. ⚠️ **버전 문자열만으로는 내용물을 보증하지 못한다 — 배포물 SHA256을 브라우저에서 직접 계산해 대조할 것(L32).**
3. 소스 `APP_VERSION` = 로컬 `src_v1.4.30/src/lib/version.ts` = '1.4.30'.
4. **(v1.4.18 근접사고 이후 추가)** 배포 직전 **빌드된 번들에 박힌 버전 문자열**을 grep으로 확인(L25) — `verify.sh` ⑦이 자동으로 한다.

**세션 종료 시(필수):** 코드/배포 변경 시 ① RELEASE_LOG 항목 추가 ② 이 문서 스탬프·다음작업 갱신 ③ **기록 3종 동기화(L14·L20: 프로젝트 메모리 + 로컬 + GitHub) — 미루지 말 것.**

> **⚠️⚠️ 2026-08-29 추가 — 이 문서 본문(위 스탬프 포함)은 v1.4.30에서 멈춰 있다. 실제 최신 상태 아님, 착각 금지.** 이 파일의 상단 스탬프는 v1.4.30이지만, **실제 배포·소스는 그 이후로 최소 v1.4.46까지 진행됐다**(이 폴더의 `wordcraft_src_v1.4.46.tgz`·`RELEASE_v1.4.45.md` 존재로 확인). 이 문서 본문이 낡은 채로 유지되는 것은 설계된 동작이다(§0 "낡을 수 있다" 참고, `00_START_HERE_스탬프_최신.md`가 자주 갱신되는 실제 스탬프 역할). **다만 그 스탬프 파일도 2026-08-16(v1.4.42) 이후로 갱신되지 않은 것으로 보인다** — v1.4.45·46은 스탬프 파일의 "최근 릴리스" 목록에도 없다. 즉 **v1.4.43~46 구간의 실제 변경 내용을 요약한 문서가 이 폴더 어디에도 없을 가능성**이 있다(확인 안 됨 — Claude Code 세션이 직접 `RELEASE_v1.4.43~46.md` 존재 여부와 git 커밋 로그를 확인해야 함). **새 세션(Claude Code)은 이 문서의 "지금 최우선"·구조 설명을 참고 자료로만 쓰고, 현재 상태 판단은 반드시 진실 3종(라이브 version.json · RELEASE_v1.4.46 또는 그 이후 · 소스 APP_VERSION)으로 직접 재확인할 것.**
>
> **⚠️ 2026-08-29 추가 — 기록 3종 동기화 재확인 필요.** 이 문서와 아래 항목 9~12에서 참조하는 신규 문서들(`콘텐츠_20260829_읽기쓰기_1차착수_ABC.md`·`저작규격_기사갤러리_오버레이파이프라인_v1.md`(v1.4)·`결함대장_DEFECT_LEDGER_v1.md`·`진행상황_20260822_UIUX_MVP_v1.md`)는 **Cowork 세션의 claude.ai Project에서 이 로컬 폴더로 이번에 처음 동기화된 것**이다. `저작규격_기사스프라이트_HERO_SPEC.md`도 v1.1(뿔 negative prompt 수정)로 갱신됐다. 또한 **`개발_영구교훈_LESSONS_3_L45이후.md`부터 `_6_L64이후.md`까지(L45~L64+)가 이 로컬 폴더에 없다** — claude.ai Project에는 있지만 이 세션은 로컬에 아직 내려받지 않았다(사유: 분량이 커서 이번 동기화 범위에서 제외, Dio님께 별도 보고). **다음 세션(특히 Claude Code)은 이 공백을 인지하고, LESSONS 최신본이 필요하면 Dio님께 확인을 요청할 것.**

## 1. 지금 상태
- **제품**: 예한이(초6) 영어 학습 웹앱 "WordCraft". 한 번들(main.js)에 두 앱 — 학습자 앱(예한이) + 관제실(아빠, `/#/admin`, PIN 7351).
- **라이브 v1.4.30**: 학습(유령 보스·수정 동굴·소리 훈련소·문장 소환진·복습 라이트너·출석 15분) + 단어 대륙(2,400단어/200팩) + 워드몬 진화 + 단어 도감 + 이야기(수호자 10·팩 결말 200) + 분류 상자 + 속사 사냥 + 단어 골렘 40 + 뱃지 36종 + **보상 로드맵** + 다가구 인증 라우팅 + 가족 RLS 격리 + 전 재생 항목 음원화.
- **예한이 폰(갤럭시 A24)**: APK지만 `server.url=wordcraft-app.vercel.app` 라이브 직접 로드 → **웹 배포 = 폰 즉시 반영**. 음원은 Storage 직접 로드.
- **DB**: Supabase `gbynvzxgbpmoqdsriowz`. families·memberships·learners·answer_events·xp_events·review_cards·module_progress·sessions·tts_clips·parent_rewards·**reward_goals**. Storage `tts-audio` = 6,3xx 클립. Storage `art` = 기사 스프라이트/오버레이 자산. Edge: `tts-batch`(v4) · `tts-seed` · `vocab-seed` · `art-forge` · `art-layer`.

## 2. 🔒 철칙 (어기면 사고 재발)
1. **소스 SSOT = 로컬 `_dev_github/src_v1.4.30/`(+ tgz), 콘텐츠 SSOT = `wordcraft_content_v1.4.26.json` + 어휘 `wordcraft_vocab_v1.4.20.json`.** 컨테이너에서만 고쳐 배포 금지. ⚠️ **저장소 루트의 content.json/vocab.json은 낡아 있을 수 있다 — 빌드 입력은 tgz 안의 `public/`에서 가져온다(L32).**
2. **두 앱 공동 기록** (RELEASE_LOG에 예한이 앱+관제실+연동 함께).
3. **연동 계약 준수**(`연동계약_CONTRACT_v1.7.md`, 현재 **v1.7** — §15 보상 로드맵 신설).
4. **배포는 모아서 1회 + 스냅샷**(L1). 대용량은 모델 문맥 무통과(SendUserFile·device_commit — L0/L7).
5. **answer_events 절대 삭제 금지.** 모든 변경 additive(L17). `db.del()`은 보상 목표 전용.
6. **기록 3종 동기화(L14·L20)** — 프로젝트 메모리+로컬+GitHub, 미루지 말 것.
7. 옛 배포 URL 은퇴(L15). WebView≠크롬(L8). 배포 전 --production+playwright 스모크(L16). 오디오 계약 건드리면 재생 호출부 전수감사(L19). 오디오는 세대로 관리(L21). **음원은 파형으로 검수(L22).** 배포 전 `bash verify.sh`(L27). 세션 만료≠로그아웃(L23). 4지선다 정답 위치 계측(L24). **배포물 버전은 번들 grep으로 실증(L25).** **교차 연습은 '손이 하는 행동'으로 계측(L26).** **한 테이블에 여러 종류가 섞이면 지표가 거짓이 된다(L28).**
8. **GitHub/웹 작업은 클로드가 직접 브라우저로(L20 Dio님 선호).** 단 비밀키 입력·민감 설정은 Dio님.

## 3. 구조 & 데이터 흐름 (요약 — 상세는 RELEASE_LOG·CONTRACT)
- 학습자 앱: 스플래시→월드맵(월드1·1.5수정동굴·2~5·소리훈련소·유령출몰)→모듈세션/유령전투/소리훈련소/소환진→복습광산→룬도감→**보상 창고**→내정보→정보. + `#/connect` 연결 화면.
- **인증 라우팅(App.tsx)**: 시작 시 getAuthUser → legacy(세션無=예한 하위호환)/device(익명=바인딩 아이)/guardian(구글=가족 대시보드 `#/family`).
- **오디오(v1.4.15)**: 재생 항목 **전부** `audio_url`(Storage 공개 클립). `lib/audio.ts` 단일 채널 + 세대 토큰. TTS는 **비상 폴백으로만 존재**(절대 제거 금지, L19·L21⑤).
- 커리큘럼(28모듈): A1~A4/R0~R9/C0·C5·C6·C7/B21a·b/B22a·b/D1S·D2S·D3S/T1·T2·T3 + FORGE.

## 4. 파일 지도
| 위치 | 내용 |
|---|---|
| 로컬 `Desktop/VIBE CODING/Projects/WordCraft/wordcraft-app/` | GitHub 배포 저장소 사본. 루트 main.js·content.json·vocab.json·app.css·version.json = **v1.4.30** (2026-08-14 라이브 SHA와 일치 확인) |
| `_dev_github/src_v1.4.30/` | **소스 SSOT** — App.tsx·screens/{…,VocabContinent,WordDex,**RewardBoard**}·engine/·lib/{audio,tts,store,supabase,version,vocab,wordmon,**rewards**}·tools/음원감사_AUDIO_QA.html |
| `_dev_github/wordcraft_src_v1.4.30.tgz` | 소스 스냅샷 |
| `_dev_github/wordcraft_tests_v1.4.30.tgz` | 검사 스크립트(xp_parity·badge_check·**reward_check**·**reward_smoke**·measure20·golem_check·routes20 등) |
| `_dev_github/wordcraft_content_v1.4.26.json` | **콘텐츠 SSOT 스냅샷**(L20 ②) — 1,886,568B · SHA `f5b4b927…` |
| ⚠️ `Desktop/YEHAN/Education/Yehan_English_App/_dev_github/` | **미끼 폴더 — 절대 SSOT로 쓰지 말 것.** v1.4.6(7/16)에서 멈춰 있다 |
| `_dev_github/wordcraft_vocab_v1.4.20.json` + `vocab_packs_v3_final.tgz` | **어휘 SSOT 스냅샷** |
| `_dev_github/RELEASE_LOG.md` / `00_START_HERE.md` | 개발 원장·현황(GitHub 동반 업로드) |
| Supabase `gbynvzxgbpmoqdsriowz` | DB + Auth(구글·익명) + Storage(tts-audio, art) + Edge(tts-batch v4, tts-seed, vocab-seed, art-forge, art-layer) |
| GitHub `JKDIO/wordcraft-app` | 배포 저장소 → Vercel 자동배포 |

## 5. 빌드 & 배포 퀵스타트 (컨테이너 — 빈 컨테이너 전제)
```
# device_stage_files로 _dev_github/wordcraft_src_v1.4.30.tgz (+ tests tgz) 스테이징
mkdir -p /home/claude/wc && cd /home/claude/wc
tar xzf "/mnt/user-data/uploads/.../wordcraft_src_v1.4.30.tgz"
mkdir -p tests && tar xzf ".../wordcraft_tests_v1.4.30.tgz" && cp *.mjs .
ln -sfn /home/claude/.npm-global/lib/node_modules node_modules   # react 전역
# verify.sh는 public/vocab.json·content.json을 읽는다 → 배포 저장소에서 복사해 둘 것
bash verify.sh
NODE_ENV=production bun build src/main.tsx --outdir dist --minify --production   # ★--production(L16)
cp index.html dist/ && cp -r public/* dist/ && (dist/version.json 작성)
bash verify.sh   # ⑦ 버전 3자 대조
node reward_smoke.mjs   # (python3 -m http.server 8099 --directory dist 를 먼저 띄운다)
```
배포: main.js(+version.json, 콘텐츠 변경 시 content.json·app.css) → SendUserFile→`/mnt/user-data/outputs/`→ **claude-in-chrome file_upload로 GitHub 루트 업로드·커밋** → Vercel → 라이브 검증(version.json + 실렌더 + **음원 감사 PASS**).

## 6. 음원 파이프라인 (새 콘텐츠를 만들 때 반드시 이 순서. 어휘는 `vocab-seed`, 그 외는 `tts-seed`)
1. 콘텐츠에 `tts`(재생 텍스트)와 `voice`를 넣는다. **voice 누락 시 nova 기본**(CONTRACT §9).
2. `tts-seed` 호출(`{"dry":true}`로 먼저 개수·sha256 확인) → `tts_clips`에 pending 시딩.
3. `tts-batch` 호출(`{"hop":0}`) → 자기 연쇄로 전량 생성. 손상 복구는 `{"force":true}`.
4. `build_content.py`(또는 동일 규칙 주입)로 content.json에 audio_url 반영.
5. **`tools/음원감사_AUDIO_QA.html`로 전수 파형 감사 → PASS 아니면 배포 금지(L22).**
6. 신규 클립은 표본 청취까지 하고 릴리스한다.

## 7. 세션 시작 체크리스트
1. 이 문서 + `개발_영구교훈_LESSONS.md`(전 권) 읽기.
2. 진실 확인: 라이브 version.json(캐시버스터=1.4.30) · RELEASE_LOG 맨 위(v1.4.30) · 로컬 `src_v1.4.30` APP_VERSION · **빌드 번들 grep**(L25) · **라이브 배포물 SHA256 대조**(L32).
3. 컨테이너 비었으면 §5로 소스 복구·빌드(tgz = v1.4.30). **복구는 반드시 직전 릴리스 tgz로, 복구 직후 `diff -ru`로 유실 0 확인(L27).**
4. 작업 후: RELEASE_LOG·이 문서 갱신 + 기록 3종 동기화(L14·L20).

---
*교훈: `개발_영구교훈_LESSONS.md` (L0~L32 — 특히 L19 오디오 전수감사, L20 로컬↔GitHub 동시기록, L21 오디오 세대 관리, L22 음원은 파형으로 검수, L23 세션 만료 오판, L24 정답 위치 분포, L25 번들 grep, L26 손이 하는 행동, L27 복구 직후 diff·검사는 스크립트, L28 한 테이블 여러 종류, L29 사라진 고침, L30 독립 화면의 비대화, L31 상한·정렬 없는 조회, L32 로컬 사본도 진실이 아니다 — 라이브 SHA가 기준). **L45 이후~L64+는 claude.ai Project에는 있으나 이 로컬 폴더에는 아직 없음(2026-08-29 확인, 위 0번 항목 참고).***
