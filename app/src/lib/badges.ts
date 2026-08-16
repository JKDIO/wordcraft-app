// 뱃지 시스템 v3 (v1.4.21) — 정의·조건·진행도·판정을 한 곳에서 (앱/관제실 공용)
//
// 원칙:
//   ① 모든 뱃지는 앱의 실제 기능과 정합되는 "판정 함수"를 가진다 (장식용 뱃지 금지)
//   ② 잠긴 뱃지는 클릭하면 획득 조건(hint)과 진행도를 보여준다 (Profile/관제실 공통)
//   ③ 앱 시작 시 syncBadges()가 놓친 뱃지를 소급 지급 (동기화 유실·구버전 대비)
//
// ★v1.4.21 구조 변경 (L27 적용)★
//   v1.4.20까지 판정 규칙이 **두 곳에 복사돼 있었다** — 이 파일(앱, LocalState 기준)과
//   AdminPage(관제실, 서버 행 기준). 한쪽만 고치면 "아이 화면엔 있는데 관제실엔 없는" 뱃지가 생긴다.
//   XP 산식에서 똑같은 사고를 겪었으므로(L27), 규칙을 **BadgeFacts → earnedFrom() 하나**로 합쳤다.
//   앱은 LocalState에서, 관제실은 서버 행에서 **각자 사실(facts)만 만들고** 규칙은 이 함수만 쓴다.
import type { LocalState } from './store'
import { MODULE_ORDER, WORLDS, RUNE_MODULES, EXT_WORLDS, EXT_MODULE_ORDER } from './content'

/** v1.4.27 — 뱃지가 59개로 늘었다. 한 덩어리로 보면 벽이 되므로 **성격별**로 끊는다.
 *  분류 기준은 '어디서 얻는가'가 아니라 **'무슨 능력을 증명하는가'**다 —
 *  아이가 "나는 읽기가 4/4구나"처럼 자기 강약점을 스스로 읽을 수 있어야 하기 때문이다. */
export type BadgeGroup =
  | '정복'          // 전체 진도 이정표 (개별 월드 클리어는 각 과목으로 보냈다)
  | '소리와 철자'    // 월드 1 소리 광산 · 월드 1.5 수정 동굴(발음기호)
  | '문장과 문법'    // 월드 2 문법 성 · 문장 소환
  | '읽기의 눈'      // 월드 6 독해 던전
  | '단어 조립'      // 월드 7 어휘 대장간
  | '말하기'         // 월드 4 생존 캠프 · 월드 8 회화 아레나
  | '쓰기'           // 월드 9 서술 마스터리
  | '꾸준함'         // 습관
  | '복습과 기억'    // 장기기억
  | '단어 대륙'      // 어휘 엔진
  | '수호자와 보스'  // 큰 전투

export interface BadgeDef {
  emoji: string
  name: string
  desc: string // 획득 후 표시되는 설명
  hint: string // 잠김 상태에서 클릭 시 보여줄 획득 조건
  group: BadgeGroup
  /** 진행도 (표시용). null이면 진행바 없이 조건 문구만 */
  progress?: (s: LocalState) => { cur: number; max: number } | null
  /** 앱에서만 판정 가능한 뱃지(서버 이벤트로 되짚을 수 없음). 관제실은 badges 테이블로만 본다. */
  localOnly?: boolean
}

// ── 사실(facts) — 규칙이 필요로 하는 최소 숫자들 ────────────────────────
export interface BadgeFacts {
  /** 학습 모듈(진단·어휘팩·골렘 제외) 중 완료한 것 */
  modulesDone: string[]
  /** 학습 모듈 중 100점이 하나라도 있는가 */
  perfectModule: boolean
  /** v1.4.27 — 확장 월드(6~9) 모듈 중 100점이 하나라도 있는가 */
  perfectExt: boolean
  diagDone: number
  streak: number
  bossWins: number
  reviewCorrect: number
  balanceDays: number
  /** 소환진에서 발견한 문장 수 */
  forgeFound: number
  /** 완료한 룬 챕터(수정 동굴) 수 */
  runeChapters: number
  // ── v1.4.16~ 단어 대륙 ──
  /** 정복한 팩 id들 ('V3-07') */
  vocabPacks: string[]
  /** ★★★(90%+)로 정복한 팩 수 */
  vocabPerfect: number
  /** 격파한 단어 골렘 수 */
  golems: number
  /** 👑 전설(라이트너 박스 5)까지 키운 워드몬 수 */
  legendWords: number
  // ── v1.4.20 신규 활동 (앱 로컬 판정) ──
  /** 분류 상자를 12개 전부 제자리에 넣은 횟수 */
  sortPerfect: number
  /** 속사 사냥 한 판 최고 기록 */
  rapidBest: number
}

export const VOCAB_PACK_RE = /^V(\d{1,2})-(\d{2})$/
export const GOLEM_RE = /^GOLEM-T(\d{1,2})-(\d)$/
const isDone = (st?: string) => st === 'completed' || st === 'mastered'

/** 앱(LocalState) → 사실 */
export function factsFromLocal(s: LocalState): BadgeFacts {
  // v1.4.25: 확장 월드(6~9)를 포함한다. 빠뜨리면 그 월드 정복 뱃지가 **조용히 영영 안 나온다**
  // (v1.4.21에서 '수호자 수'를 호출자가 채우게 했다가 똑같은 사고를 냈다 — 파생은 규칙 안에서 계산한다).
  // 아이 화면에 확장 월드(6~9)가 안 보이는 동안엔 그 모듈이 completed가 될 일 자체가 없으므로 안전하다.
  const done = [...MODULE_ORDER, ...EXT_MODULE_ORDER].filter(id => isDone(s.progress[id]?.status))
  const packs: string[] = []
  let perfect = 0, golems = 0
  for (const key of Object.keys(s.progress)) {
    if (!isDone(s.progress[key]?.status)) continue
    if (VOCAB_PACK_RE.test(key)) {
      packs.push(key)
      if ((s.progress[key]?.best_score ?? 0) >= 90) perfect++
    } else if (GOLEM_RE.test(key)) golems++
  }
  return {
    modulesDone: done,
    // v1.4.27: 관제실(AdminPage)은 이미 확장 월드까지 보고 있었다 — 여기만 28개 기준이라 어긋나 있었다(봉합)
    perfectModule: [...MODULE_ORDER, ...EXT_MODULE_ORDER].some(id => (s.progress[id]?.best_score ?? 0) >= 100),
    perfectExt: EXT_MODULE_ORDER.some(id => (s.progress[id]?.best_score ?? 0) >= 100),
    diagDone: diagDoneCount(s),
    streak: s.streak_days || 0,
    bossWins: (s.bossWins || []).length,
    reviewCorrect: s.reviewTotal || 0,
    balanceDays: (s.balanceDays || []).length,
    forgeFound: (s.forgeFound || []).length,
    runeChapters: RUNE_MODULES.filter(id => isDone(s.progress[id]?.status)).length,
    vocabPacks: packs,
    vocabPerfect: perfect,
    golems,
    legendWords: (s.legendWords || []).length,
    sortPerfect: s.sortPerfect || 0,
    rapidBest: s.rapidBest || 0,
  }
}

/** 티어당 팩이 20개다 — 20개를 다 정복한 티어 = 수호자 완전 각성.
 *  (vocab.json을 읽지 않아도 pack_id만으로 셀 수 있게 규칙을 id에 담아 뒀다.) */
export const PACKS_PER_TIER = 20
export function guardiansFrom(packIds: string[]): number {
  const byTier: Record<string, Set<string>> = {}
  for (const id of packIds) {
    const m = VOCAB_PACK_RE.exec(id)
    if (!m) continue
    ;(byTier[m[1]] ||= new Set()).add(id)
  }
  return Object.values(byTier).filter(s => s.size >= PACKS_PER_TIER).length
}

const doneModules = (s: LocalState) => [...MODULE_ORDER, ...EXT_MODULE_ORDER].filter(id => isDone(s.progress[id]?.status))

/** 진단 완료 수 — 로컬 diagDone ∪ 서버 병합된 progress의 DIAG-* 행 (풀 스캔 뱃지 누락 봉합) */
export const diagDoneCount = (s: LocalState) => {
  const ids = new Set(s.diagDone)
  for (const key of Object.keys(s.progress)) {
    if (!key.startsWith('DIAG-')) continue
    if (isDone(s.progress[key]?.status)) ids.add(key.slice(5))
  }
  return ids.size
}

const worldDone = (s: LocalState, world: number) => {
  const w = [...WORLDS, ...EXT_WORLDS].find(x => x.world === world)
  if (!w || !w.modules.length) return { cur: 0, max: 1 }
  const done = doneModules(s)
  return { cur: w.modules.filter(id => done.includes(id)).length, max: w.modules.length }
}
/** 진행도 헬퍼 — facts에서 뽑아 상한으로 자른다 */
const p = (get: (f: BadgeFacts) => number, max: number) =>
  (s: LocalState) => ({ cur: Math.min(get(factsFromLocal(s)), max), max })
/** 지정한 모듈들을 몇 개 깼는지 — 확장 월드(6~9) 콘텐츠 뱃지의 진행도 */
const mods = (...ids: string[]) => (s: LocalState) => {
  const done = doneModules(s)
  return { cur: ids.filter(id => done.includes(id)).length, max: ids.length }
}

export const BADGE_DEFS: Record<string, BadgeDef> = {
  // ── 모험 ──────────────────────────────────────────────
  first_module: {
    emoji: '🥇', name: '첫 채굴', desc: '첫 모듈 클리어', hint: '아무 모듈이나 1개 클리어하면 획득!', group: '정복',
    progress: s => ({ cur: Math.min(1, doneModules(s).length), max: 1 }),
  },
  world1_clear: { emoji: '⛏️', name: '소리 광산 정복', desc: '월드 1 전체 클리어', hint: '월드 1(소리 광산)의 모든 챕터를 클리어하면 획득!', group: '소리와 철자', progress: s => worldDone(s, 1) },
  'world1.5_clear': { emoji: '💎', name: '수정 동굴 정복', desc: '월드 1.5 전체 클리어 — 소리를 여는 자', hint: '수정 동굴(R0~R9)의 모든 룬 챕터를 클리어하면 획득!', group: '소리와 철자', progress: s => worldDone(s, 1.5) },
  world2_clear: { emoji: '🏰', name: '문법 성 정복', desc: '월드 2 전체 클리어', hint: '월드 2(문법 성)의 모든 챕터를 클리어하면 획득!', group: '문장과 문법', progress: s => worldDone(s, 2) },
  world3_clear: { emoji: '🏹', name: '사냥의 달인', desc: '월드 3 전체 클리어', hint: '월드 3(동사 사냥터)의 모든 챕터를 클리어하면 획득!', group: '정복', progress: s => worldDone(s, 3) },
  world4_clear: { emoji: '🏕️', name: '생존왕', desc: '월드 4 전체 클리어', hint: '월드 4(생존 캠프)의 모든 챕터를 클리어하면 획득!', group: '말하기', progress: s => worldDone(s, 4) },
  world5_clear: { emoji: '⏳', name: '시간의 지배자', desc: '월드 5 전체 클리어', hint: '월드 5(시제 시간여행)의 모든 챕터를 클리어하면 획득!', group: '정복', progress: s => worldDone(s, 5) },
  // v1.4.25 — 확장 월드 개방과 같은 릴리스에서 뱃지도 만든다.
  // 24모듈을 클리어했는데 받을 뱃지가 하나도 없으면, 아이 입장에서 그 월드는 '보상이 없는 방'이다.
  //
  // ★v1.4.42 — 월드 번호를 7~10 → 6~9로 당기면서 뱃지 ID도 같이 당겼다.★
  //   뱃지 ID는 `world${w.world}_clear`로 **자동 생성**되므로(아래 earnedFrom),
  //   content.ts의 숫자만 바꾸고 여기를 안 바꾸면 도감에 없는 ID가 발급돼 **조용히 안 보이는 뱃지**가 된다.
  //   안전 확인: 배포 전 DB 조회에서 world7~10_clear를 받은 학습자는 **0명**이었다(옛 ID 유실 없음).
  world6_clear: { emoji: '📖', name: '던전 해독가', desc: '월드 6 전체 클리어', hint: '독해 던전(P1~P6)의 모든 층을 클리어하면 획득! 그림자 문장이 전부 읽힌다', group: '읽기의 눈', progress: s => worldDone(s, 6) },
  world7_clear: { emoji: '🔨', name: '단어 대장장이', desc: '월드 7 전체 클리어', hint: '어휘 대장간(W1~W6)을 전부 클리어하면 획득! 모르는 단어도 분해해서 뜻을 추리하게 된다', group: '단어 조립', progress: s => worldDone(s, 7) },
  world8_clear: { emoji: '💬', name: '아레나 챔피언', desc: '월드 8 전체 클리어', hint: '회화 아레나(S1~S6)를 전부 클리어하면 획득! 관중이 다시 소리를 낸다', group: '말하기', progress: s => worldDone(s, 8) },
  world9_clear: { emoji: '✍️', name: '잉크의 계승자', desc: '월드 9 전체 클리어', hint: '서술 마스터리(G1~G6)를 전부 클리어하면 획득! 흩어진 이야기책이 다시 이어진다', group: '쓰기', progress: s => worldDone(s, 9) },
  newland_half: {
    emoji: '🌗', name: '새 대륙 절반', desc: '월드 6~9 중 12모듈 클리어', hint: '새로 열린 네 월드에서 12개 스테이지를 깨면 획득! 딱 절반 지점이야', group: '정복',
    progress: s => ({ cur: Math.min(doneModules(s).filter(id => EXT_MODULE_ORDER.includes(id)).length, 12), max: 12 }),
  },
  perfect_newland: {
    emoji: '💠', name: '새 월드 퍼펙트', desc: '월드 6~9 모듈을 정확도 100%로 클리어', hint: '새 월드(6~9)의 스테이지 하나를 하나도 안 틀리고 깨면 획득!', group: '정복',
    progress: () => null,
  },
  all_worlds: {
    emoji: '🌐', name: '세계 정복', desc: '전 월드 52모듈 클리어', hint: '월드 1부터 9까지 52개 스테이지를 전부 클리어하면 획득. 여기까지 온 사람은 아직 없다', group: '정복',
    progress: s => ({ cur: doneModules(s).length, max: MODULE_ORDER.length + EXT_MODULE_ORDER.length }),
  },

  // ── 📖 읽기의 눈 (월드 6 독해 던전) ─────────────────────
  // 한국어 화자가 영어 문장에서 실제로 막히는 지점 하나하나를 뱃지로 만들었다.
  read_chunk: {
    emoji: '🔦', name: '첫 단서', desc: '덩어리로 끊어 읽기 습득', hint: "독해 던전 1층 '그림자 문장'을 클리어하면 획득! 이제 뒤에서부터 번역하지 않아도 돼", group: '읽기의 눈',
    progress: mods('P1'),
  },
  read_backward: {
    emoji: '🪞', name: '거꾸로 읽기 졸업', desc: '후치수식 돌파 — 꾸미는 말이 뒤에 온다', hint: "독해 던전 2층 '뒤에서 꾸미는 자들'을 클리어하면 획득! 한국어와 정반대인 그 자리를 이겨낸 증거", group: '읽기의 눈',
    progress: mods('P2'),
  },
  read_signal: {
    emoji: '🚦', name: '신호등 해독가', desc: '담화 표지로 다음 내용 예측', hint: "독해 던전 4층 '신호등 마을'을 클리어하면 획득! however가 보이면 다음이 뒤집힌다는 걸 안다", group: '읽기의 눈',
    progress: mods('P4'),
  },
  read_gist: {
    emoji: '🎯', name: '요지 저격수', desc: '긴 글에서 핵심 한 줄 찾기', hint: "독해 던전 5층 '요지 사냥'을 클리어하면 획득! 다 읽지 않고도 뼈대를 잡는다", group: '읽기의 눈',
    progress: mods('P5'),
  },

  // ── 🔨 단어 조립 (월드 7 어휘 대장간) ───────────────────
  // 외우는 게 아니라 **분해하고 조립하는** 능력을 증명한다.
  smith_prefix: {
    emoji: '⚒️', name: '반대의 망치', desc: '부정 접두사 4종 습득', hint: "어휘 대장간 '반대의 망치'를 클리어하면 획득! un-·in-·dis-·non-으로 뜻을 뒤집는다", group: '단어 조립',
    progress: mods('W1'),
  },
  smith_suffix: {
    emoji: '🪄', name: '품사 변신술사', desc: '파생 접미사로 품사 바꾸기', hint: "어휘 대장간 '변신 모루'를 클리어하면 획득! 동사를 명사로, 명사를 형용사로 바꾼다", group: '단어 조립',
    progress: mods('W3'),
  },
  smith_root: {
    emoji: '🏛️', name: '두 유적의 주인', desc: '라틴·그리스 어근 정복', hint: '라틴 유적과 그리스 유적을 둘 다 클리어하면 획득! 처음 보는 단어도 뜯어서 추리한다', group: '단어 조립',
    progress: mods('W4', 'W5'),
  },
  smith_particle: {
    emoji: '🌀', name: '파티클 마법사', desc: '구동사 파티클 6종 습득', hint: "어휘 대장간 '파티클 마법서'를 클리어하면 획득! up·down·out·off·on·in의 속성을 안다", group: '단어 조립',
    progress: mods('W6'),
  },

  // ── 💬 말하기 (월드 8 회화 아레나) ──────────────────────
  arena_chunk: {
    emoji: '🗣️', name: '표현 인벤토리', desc: '덩어리 표현 장착', hint: "회화 아레나 '표현 인벤토리'를 클리어하면 획득! 문법으로 만들지 않고 통째로 꺼내 쓴다", group: '말하기',
    progress: mods('S1'),
  },
  arena_rhythm: {
    emoji: '🥁', name: '영어 박자 장착', desc: '강세와 연음 습득', hint: "'리듬 대장간'과 '연음 다리'를 둘 다 클리어하면 획득! 또박또박이 아니라 영어 박자로 말한다", group: '말하기',
    progress: mods('S2', 'S3'),
  },
  arena_432: {
    emoji: '⏱️', name: '4·3·2 완주', desc: '같은 이야기를 60→45→30초로', hint: "'타임어택 아레나'를 클리어하면 획득! 같은 내용을 점점 빠르게 말해내면 유창성이 붙는다", group: '말하기',
    progress: mods('S4'),
  },
  arena_stage: {
    emoji: '🎭', name: '무대 체질', desc: '역할극과 거울 방 통과', hint: "'역할극 던전'과 '거울 방'을 둘 다 클리어하면 획득! 내 목소리를 스스로 듣고 다시 말해봤다는 증거", group: '말하기',
    progress: mods('S5', 'S6'),
  },

  // ── ✍️ 쓰기 (월드 9 서술 마스터리) ─────────────────────
  write_combine: {
    emoji: '🔗', name: '문장 합체사', desc: '두 문장을 하나로 합치기', hint: '합체 공방 I·II를 둘 다 클리어하면 획득! 짧은 문장 두 개를 자연스럽게 잇는다', group: '쓰기',
    progress: mods('G1', 'G2'),
  },
  write_para: {
    emoji: '🧱', name: '문단 건축가', desc: '주제문+뒷받침+마무리 구조', hint: "'문단 조립 라인'을 클리어하면 획득! 문장을 쌓아 문단을 짓는다", group: '쓰기',
    progress: mods('G3'),
  },
  write_exam: {
    emoji: '📝', name: '서술형 돌파', desc: '조건 영작 — 수일치·시제·관사·스펠링', hint: "'서술형 시뮬레이터'를 클리어하면 획득! 중학교 서술형에서 점수 깎이는 네 가지를 막는다", group: '쓰기',
    progress: mods('G5'),
  },
  write_letter: {
    emoji: '💌', name: '우체통에 넣다', desc: '내 글을 직접 써서 아빠에게', hint: "'잉크의 우체통'을 클리어하면 획득! 앱이 채점하지 않는 진짜 내 글을 아빠에게 읽어줬다는 증거", group: '쓰기',
    progress: mods('G6'),
  },
  // ── v1.4.28 카테고리 균형 보강 ─────────────────────────
  // 재배치만으로는 '정복'만 두껍고 나머지가 얇았다. 각 분야에 **중간 이정표**를 넣어
  // "다음 목표가 늘 손 닿는 곳에 있게" 만든다(멀기만 한 목표는 동기를 못 만든다).
  rune_first: {
    emoji: '🔹', name: '첫 룬', desc: '수정 동굴 룬 챕터 1개 완료', hint: '수정 동굴에서 룬 챕터를 하나만 깨도 획득! 철자가 아니라 소리로 읽는 첫걸음', group: '소리와 철자',
    progress: p(f => f.runeChapters, 1),
  },
  rune_10: {
    emoji: '🔷', name: '룬 마스터', desc: '수정 동굴 룬 챕터 10개 전부 완료', hint: '수정 동굴의 룬 챕터 10개를 전부 클리어하면 획득! 발음기호를 사전처럼 읽는다', group: '소리와 철자',
    progress: p(f => f.runeChapters, 10),
  },
  forge_5: {
    emoji: '✨', name: '첫 소환', desc: '서로 다른 문장 5개 소환', hint: '문법 단원의 🔮 문장 소환에서 서로 다른 문장 5개를 만들면 획득!', group: '문장과 문법',
    progress: p(f => f.forgeFound, 5),
  },
  forge_50: {
    emoji: '🌠', name: '문장 대장장이', desc: '서로 다른 문장 50개 소환', hint: '서로 다른 문장 50개 소환! 이쯤이면 블록 없이도 문장이 만들어진다', group: '문장과 문법',
    progress: p(f => f.forgeFound, 50),
  },
  read_maze: {
    emoji: '🧭', name: '미로 탈출자', desc: '대명사가 가리키는 것 추적', hint: "독해 던전 3층 '대명사 미로'를 클리어하면 획득! it과 they가 누구인지 놓치지 않는다", group: '읽기의 눈',
    progress: mods('P3'),
  },
  read_tower: {
    emoji: '🗼', name: '탑의 정복자', desc: '문장 순서 배열과 삽입', hint: "독해 던전 6층 '순서의 탑'을 클리어하면 획득! 중학교 내신에 그대로 나오는 유형", group: '읽기의 눈',
    progress: mods('P6'),
  },
  smith_beyond: {
    emoji: '🔁', name: '다시·너머의 망치', desc: '방향 접두사 8종 습득', hint: "어휘 대장간 '다시·너머의 망치'를 클리어하면 획득! re-·pre-·over-·under-로 뜻을 옮긴다", group: '단어 조립',
    progress: mods('W2'),
  },
  write_remix: {
    emoji: '🎛️', name: '리믹스 장인', desc: '모범문 구조를 빌려 내 문장으로', hint: "'모방 개조 공방'을 클리어하면 획득! 좋은 문장의 틀만 빌려 내용을 내 것으로 바꾼다", group: '쓰기',
    progress: mods('G4'),
  },
  streak_30: {
    emoji: '🌟', name: '한 달 무정지', desc: '30일 연속 출석', hint: '30일 연속으로 공부하면 획득! 여기까지 오면 습관이 된 거야', group: '꾸준함',
    progress: s => ({ cur: Math.min(s.streak_days, 30), max: 30 }),
  },
  balance_21: {
    emoji: '🧘', name: '균형의 달인', desc: '모험+복습 둘 다 한 날 21일', hint: '하루에 모험과 복습을 둘 다 한 날이 21일! 새로 배우기와 안 잊기를 같이 해낸 증거', group: '꾸준함',
    progress: s => ({ cur: Math.min((s.balanceDays || []).length, 21), max: 21 }),
  },
  review_500: {
    emoji: '🏔️', name: '광산의 전설', desc: '복습 카드 500개 정답', hint: '복습 광산에서 카드 500개! 여기부터는 잊는 속도보다 쌓는 속도가 빠르다', group: '복습과 기억',
    progress: s => ({ cur: Math.min(s.reviewTotal || 0, 500), max: 500 }),
  },
  boss_15: {
    emoji: '🗡️', name: '보스 학살자', desc: '보스전 15회 승리', hint: '서로 다른 모듈의 보스전에서 15번 이기면 획득! 배운 걸 실전에서 증명한 횟수', group: '수호자와 보스',
    progress: s => ({ cur: Math.min((s.bossWins || []).length, 15), max: 15 }),
  },

  perfect_module: { emoji: '💯', name: '퍼펙트!', desc: '정확도 100% 클리어', hint: '한 모듈을 정확도 100%로 클리어하면 획득!', group: '문장과 문법', progress: () => null },
  boss_slayer: {
    emoji: '⚔️', name: '보스 사냥꾼', desc: '보스전 5회 승리', hint: '서로 다른 모듈의 보스전에서 5번 이기면 획득!', group: '수호자와 보스',
    progress: s => ({ cur: Math.min((s.bossWins || []).length, 5), max: 5 }),
  },
  diag_all: {
    emoji: '📡', name: '풀 스캔', desc: '진단 4종 완료', hint: '플레이어 스캔(진단) 4종을 모두 완료하면 획득!', group: '문장과 문법',
    progress: s => ({ cur: Math.min(diagDoneCount(s), 4), max: 4 }),
  },
  // v1.4.21 신규 — 그동안 뱃지가 없던 기능들
  rune_5: {
    emoji: '💠', name: '룬 해독가', desc: '수정 동굴 룬 챕터 5개 완료', hint: '수정 동굴에서 룬 챕터 5개를 클리어하면 획득! 소리의 규칙이 보이기 시작한다', group: '소리와 철자',
    progress: p(f => f.runeChapters, 5),
  },
  forge_20: {
    // v1.4.24 — 독립 소환진 화면을 없애고 문법 단원의 소환 스텝으로 옮겼다. 발견 판정(서로 다른 문장 20개)은
    // 그대로 살아 있고, 예한이가 이미 모은 forgeFound 기록도 그대로 쓰인다(L17 무손실).
    emoji: '🔮', name: '문장 연금술사', desc: '서로 다른 문장 20개 소환', hint: '문법 단원의 🔮 문장 소환에서 서로 다른 문장 20개를 만들어 내면 획득!', group: '문장과 문법',
    progress: p(f => f.forgeFound, 20),
  },

  // ── 꾸준함 ────────────────────────────────────────────
  streak_3: { emoji: '🔥', name: '3일 연속', desc: '3일 연속 출석', hint: '3일 연속으로 공부하면 획득!', group: '꾸준함', progress: s => ({ cur: Math.min(s.streak_days, 3), max: 3 }) },
  streak_7: { emoji: '🌋', name: '일주일 불꽃', desc: '7일 연속 출석', hint: '7일 연속으로 공부하면 획득!', group: '꾸준함', progress: s => ({ cur: Math.min(s.streak_days, 7), max: 7 }) },
  streak_14: { emoji: '☄️', name: '2주 무정지', desc: '14일 연속 출석', hint: '14일 연속으로 공부하면 획득! 진짜 각오가 필요해', group: '꾸준함', progress: s => ({ cur: Math.min(s.streak_days, 14), max: 14 }) },
  balance_7: {
    emoji: '⚖️', name: '황금 밸런스', desc: '모험+복습 둘 다 한 날 7일 달성', hint: '하루에 모험(모듈)과 복습을 둘 다 한 날을 7일 모으면 획득!', group: '꾸준함',
    progress: s => ({ cur: Math.min((s.balanceDays || []).length, 7), max: 7 }),
  },

  // ── 복습·기억 ─────────────────────────────────────────
  review_10: { emoji: '🪨', name: '견습 광부', desc: '복습 카드 10개 정답', hint: '복습 광산에서 카드 10개를 맞히면 획득!', group: '복습과 기억', progress: s => ({ cur: Math.min(s.reviewTotal || 0, 10), max: 10 }) },
  review_50: { emoji: '💎', name: '다이아 채굴자', desc: '복습 카드 50개 정답', hint: '복습 광산에서 카드 50개를 맞히면 획득!', group: '복습과 기억', progress: s => ({ cur: Math.min(s.reviewTotal || 0, 50), max: 50 }) },
  review_200: { emoji: '👑', name: '전설의 광부', desc: '복습 카드 200개 정답', hint: '복습 광산에서 카드 200개를 맞히면 획득! 장기기억 만렙 인증', group: '복습과 기억', progress: s => ({ cur: Math.min(s.reviewTotal || 0, 200), max: 200 }) },
  // v1.4.21 신규 — 워드몬 진화(라이트너 박스 5 = 👑 전설)
  wordmon_legend_10: {
    emoji: '👑', name: '전설 조련사', desc: '워드몬 10마리를 전설까지 키움', hint: '복습 광산에서 단어 10개를 👑전설(5단계)까지 진화시키면 획득!', group: '복습과 기억',
    progress: p(f => f.legendWords, 10),
  },
  wordmon_legend_50: {
    emoji: '🐲', name: '전설 군단', desc: '워드몬 50마리를 전설까지 키움', hint: '👑전설 워드몬 50마리! 여기까지 오면 그 단어들은 진짜 네 것이야', group: '복습과 기억',
    progress: p(f => f.legendWords, 50),
  },

  // ── 단어 대륙 ─────────────────────────────────────────
  vocab_first: {
    emoji: '🗺️', name: '첫 상륙', desc: '단어 대륙 첫 구역 정복', hint: '단어 대륙에서 아무 구역이나 하나 정복하면 획득!', group: '단어 대륙',
    progress: p(f => f.vocabPacks.length, 1),
  },
  vocab_10: {
    emoji: '🎒', name: '단어 사냥꾼', desc: '10구역 정복 (120단어)', hint: '단어 대륙 10구역을 정복하면 획득! 단어 120개가 네 것이 된다', group: '단어 대륙',
    progress: p(f => f.vocabPacks.length, 10),
  },
  vocab_50: {
    emoji: '🧭', name: '대륙 탐험가', desc: '50구역 정복 (600단어)', hint: '단어 대륙 50구역 정복! 여기서부터는 교과서가 쉬워지기 시작해', group: '단어 대륙',
    progress: p(f => f.vocabPacks.length, 50),
  },
  vocab_100: {
    emoji: '🏔️', name: '반환점', desc: '100구역 정복 (1,200단어)', hint: '단어 대륙의 절반! 100구역을 정복하면 획득', group: '단어 대륙',
    progress: p(f => f.vocabPacks.length, 100),
  },
  vocab_200: {
    emoji: '🌍', name: '대륙의 주인', desc: '200구역 전부 정복 (2,400단어)', hint: '단어 대륙 200구역을 전부 정복하면 획득. GIU Basic + 중학 전 과정이 끝난다', group: '단어 대륙',
    progress: p(f => f.vocabPacks.length, 200),
  },
  vocab_perfect_5: {
    emoji: '🎯', name: '별 셋 사냥꾼', desc: '★★★로 정복한 구역 5개', hint: '한 구역을 90% 이상(★★★)으로 정복하기 — 5번 하면 획득!', group: '단어 대륙',
    progress: p(f => f.vocabPerfect, 5),
  },
  vocab_perfect_25: {
    emoji: '💫', name: '무결점 정복', desc: '★★★로 정복한 구역 25개', hint: '★★★ 구역 25개! 빠르게가 아니라 정확하게 간 사람만 받는 뱃지', group: '단어 대륙',
    progress: p(f => f.vocabPerfect, 25),
  },
  sort_perfect_5: {
    emoji: '🗃️', name: '분류의 달인', desc: '분류 상자를 한 번에 전부 맞힘 5회', hint: '분류 상자에서 단어를 하나도 안 틀리고 전부 제자리에 넣기 — 5번 하면 획득!', group: '단어 대륙',
    localOnly: true, progress: p(f => f.sortPerfect, 5),
  },
  rapid_20: {
    emoji: '🔥', name: '속사왕', desc: '속사 사냥 한 판에 20마리', hint: '속사 사냥 45초 안에 20마리를 잡으면 획득! 손이 머리보다 빨라야 한다', group: '단어 대륙',
    localOnly: true, progress: p(f => f.rapidBest, 20),
  },

  // ── 수호자와 보스 ─────────────────────────────────────
  guardian_first: {
    emoji: '🌱', name: '첫 수호자', desc: '한 구역의 수호자를 완전히 깨움', hint: '한 티어의 20구역을 전부 정복하면 그곳의 수호자가 완전히 깨어난다!', group: '수호자와 보스',
    progress: s => ({ cur: Math.min(guardiansFrom(factsFromLocal(s).vocabPacks), 1), max: 1 }),
  },
  guardian_5: {
    emoji: '✨', name: '다섯 봉우리', desc: '수호자 5명 완전 각성', hint: '수호자 5명을 완전히 깨우면 획득. 대륙 절반이 네 편이 된다', group: '수호자와 보스',
    progress: s => ({ cur: Math.min(guardiansFrom(factsFromLocal(s).vocabPacks), 5), max: 5 }),
  },
  guardian_all: {
    emoji: '🐉', name: '열 수호자와 함께', desc: '수호자 10명 전부 각성 — 렉시와 함께 무자 앞으로', hint: '열 지역의 수호자를 모두 깨우면 획득. 마지막 용 렉시가 너와 함께 선다', group: '수호자와 보스',
    progress: s => ({ cur: Math.min(guardiansFrom(factsFromLocal(s).vocabPacks), 10), max: 10 }),
  },
  golem_first: {
    emoji: '💥', name: '첫 골렘', desc: '단어 골렘 1마리 격파', hint: '구역 5개를 정복하면 단어 골렘이 나타난다 — 한 마리 격파하면 획득!', group: '수호자와 보스',
    progress: p(f => f.golems, 1),
  },
  golem_10: {
    emoji: '🪓', name: '골렘 파쇄기', desc: '단어 골렘 10마리 격파', hint: '단어 골렘 10마리 격파! 갑옷 120칸을 부순 셈이야', group: '수호자와 보스',
    progress: p(f => f.golems, 10),
  },
  golem_all: {
    emoji: '🏆', name: '골렘 마스터', desc: '단어 골렘 40마리 전부 격파', hint: '대륙의 골렘 40마리를 전부 격파하면 획득. 한 마리도 남기지 않은 사람만', group: '수호자와 보스',
    progress: p(f => f.golems, 40),
  },
}

/** 화면에 보여줄 순서 — 아이가 가장 자주 확인하는 것부터 */
export const BADGE_GROUPS: BadgeGroup[] = [
  '정복', '소리와 철자', '문장과 문법', '읽기의 눈', '단어 조립', '말하기', '쓰기',
  '꾸준함', '복습과 기억', '단어 대륙', '수호자와 보스',
]
/** 카테고리 머리글에 붙는 이모지 (Profile·관제실 공용) */
export const GROUP_EMOJI: Record<BadgeGroup, string> = {
  '정복': '🏅', '소리와 철자': '🔤', '문장과 문법': '🧩', '읽기의 눈': '📖', '단어 조립': '🔨',
  '말하기': '💬', '쓰기': '✍️', '꾸준함': '🔥', '복습과 기억': '⛏️',
  '단어 대륙': '🗺️', '수호자와 보스': '👑',
}

/** ★단일 판정 규칙★ — 앱도 관제실도 이 함수만 쓴다 (L27).
 *  facts를 어디서 만들었든(로컬 상태 / 서버 행) 결과는 같아야 한다. */
export function earnedFrom(f: BadgeFacts): string[] {
  const out: string[] = []
  // ⚠️ 수호자 수는 **여기서 직접 센다.** facts에 넣어 두면 호출자가 빠뜨렸을 때
  //    수호자 뱃지가 조용히 영영 안 나온다(검사에서 실제로 걸렸다).
  const guardians = guardiansFrom(f.vocabPacks)
  const add = (cond: boolean, id: string) => { if (cond) out.push(id) }

  add(f.modulesDone.length >= 1, 'first_module')
  for (const w of [...WORLDS, ...EXT_WORLDS]) {
    if (w.modules.length && w.modules.every(id => f.modulesDone.includes(id))) out.push(`world${w.world}_clear`)
  }
  add(f.perfectModule, 'perfect_module')
  add(f.bossWins >= 5, 'boss_slayer')
  add(f.diagDone >= 4, 'diag_all')
  add(f.runeChapters >= 5, 'rune_5')
  add(f.forgeFound >= 5, 'forge_5')
  add(f.forgeFound >= 20, 'forge_20')
  add(f.forgeFound >= 50, 'forge_50')
  add(f.runeChapters >= 1, 'rune_first')
  add(f.runeChapters >= 10, 'rune_10')
  add(f.bossWins >= 15, 'boss_15')
  add(f.streak >= 30, 'streak_30')
  add(f.balanceDays >= 21, 'balance_21')
  add(f.reviewCorrect >= 500, 'review_500')

  // ── v1.4.27 확장 월드(6~9) 콘텐츠 뱃지 ──────────────────────
  // ⚠️ 파생은 여기서 직접 센다(호출자가 채우게 하면 조용히 안 나온다 — v1.4.21에서 겪었다).
  const has = (...ids: string[]) => ids.every(id => f.modulesDone.includes(id))
  const extDone = f.modulesDone.filter(id => EXT_MODULE_ORDER.includes(id)).length
  add(extDone >= 12, 'newland_half')
  add(f.perfectExt, 'perfect_newland')
  add([...MODULE_ORDER, ...EXT_MODULE_ORDER].every(id => f.modulesDone.includes(id)), 'all_worlds')
  // 📖 읽기의 눈
  add(has('P1'), 'read_chunk')
  add(has('P2'), 'read_backward')
  add(has('P3'), 'read_maze')
  add(has('P4'), 'read_signal')
  add(has('P5'), 'read_gist')
  add(has('P6'), 'read_tower')
  // 🔨 단어 조립
  add(has('W1'), 'smith_prefix')
  add(has('W2'), 'smith_beyond')
  add(has('W3'), 'smith_suffix')
  add(has('W4', 'W5'), 'smith_root')
  add(has('W6'), 'smith_particle')
  // 💬 말하기
  add(has('S1'), 'arena_chunk')
  add(has('S2', 'S3'), 'arena_rhythm')
  add(has('S4'), 'arena_432')
  add(has('S5', 'S6'), 'arena_stage')
  // ✍️ 쓰기
  add(has('G1', 'G2'), 'write_combine')
  add(has('G3'), 'write_para')
  add(has('G4'), 'write_remix')
  add(has('G5'), 'write_exam')
  add(has('G6'), 'write_letter')

  add(f.streak >= 3, 'streak_3')
  add(f.streak >= 7, 'streak_7')
  add(f.streak >= 14, 'streak_14')
  add(f.balanceDays >= 7, 'balance_7')

  add(f.reviewCorrect >= 10, 'review_10')
  add(f.reviewCorrect >= 50, 'review_50')
  add(f.reviewCorrect >= 200, 'review_200')
  add(f.legendWords >= 10, 'wordmon_legend_10')
  add(f.legendWords >= 50, 'wordmon_legend_50')

  const packs = f.vocabPacks.length
  add(packs >= 1, 'vocab_first')
  add(packs >= 10, 'vocab_10')
  add(packs >= 50, 'vocab_50')
  add(packs >= 100, 'vocab_100')
  add(packs >= 200, 'vocab_200')
  add(f.vocabPerfect >= 5, 'vocab_perfect_5')
  add(f.vocabPerfect >= 25, 'vocab_perfect_25')
  add(f.sortPerfect >= 5, 'sort_perfect_5')
  add(f.rapidBest >= 20, 'rapid_20')

  add(guardians >= 1, 'guardian_first')
  add(guardians >= 5, 'guardian_5')
  add(guardians >= 10, 'guardian_all')
  add(f.golems >= 1, 'golem_first')
  add(f.golems >= 10, 'golem_10')
  add(f.golems >= 40, 'golem_all')

  return out
}

/** 현재 로컬 상태 기준 판정 (idempotent — syncBadges에서 사용) */
export function computeEarnedBadges(s: LocalState): string[] {
  return earnedFrom(factsFromLocal(s))
}
