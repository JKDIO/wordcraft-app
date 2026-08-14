// ── v1.4.16 단어 대륙 (Vocabulary Continent) ──────────────────────────────
// GIU Basic 전체 + 중학 전 과정을 덮는 2,400단어를 10티어 × 20팩 × 12단어로 운영하는 어휘 엔진.
//
// 설계 근거(마스터 블루프린트 20원리):
//   ① 인출 연습  — 모든 모드가 "꺼내보기". 읽고 넘기는 화면은 학습 카드 1장뿐이다.
//   ② 간격 반복  — 팩을 끝내면 12장이 전부 라이트너 복습 카드로 들어간다.
//   ③ 교차 연습  — 한 단어를 같은 모드로 반복하지 않는다. 매 문항 모드가 바뀐다.
//   ④ 이중 부호화 — 단어마다 음원 + 예문 + 이모지.
//   ⑧ i+1        — 팩은 12개, 그중 이미 아는 것은 사전 스캔에서 걸러 실제 새 단어만 남긴다.
//   ⑨ 정서 필터  — 아는 단어를 억지로 다시 시키지 않는다(지루함이 이탈의 1순위 원인).
//   ⑯ 자기결정   — 다음 팩을 하나로 강제하지 않고 열린 팩 중에서 고르게 한다.
//   ⑱ 바람직한 어려움 — 힌트는 3단계(초성 → 첫 글자 → 연상 단서)로 늦게 준다.
//
// 스키마 변경 0 (L17 additive): 팩 진도는 기존 module_progress에 module_id='V3-07' 형태로 기록하고,
// 복습 카드는 card_id='vocab:<단어>'로 기존 review_cards에 넣는다. 새 테이블·새 컬럼 없음.

export interface VocabWord {
  w: string
  ko: string
  pos: string
  ipa: string
  ex: string
  ex_ko: string
  hint_ko: string
  distractors: string[]
  tags?: string[]
  /** 빌드가 주입하는 음원 (단어 / 예문). 없으면 playClip이 TTS로 폴백한다(L19·L21⑤). */
  audio_url?: string
  audio_ex_url?: string
  tts?: string
}

export interface VocabPack {
  pack_id: string
  tier: number
  theme_ko: string
  title_ko: string
  emoji: string
  intro_ko: string
  /** v1.4.20 — 정복 후 결말 2문장. intro_ko가 던진 사건에 답한다. */
  outro_ko?: string
  /** v1.4.20 — 그 티어 수호자가 이 팩을 보고 던지는 한마디 */
  guardian_ko?: string
  words: VocabWord[]
}

/** v1.4.20 — 티어 수호자. 팩을 정복할수록 깨어난다(각성 5단계). */
export interface VocabGuardian {
  name_ko: string
  name_en: string
  emoji: string
  look_ko: string
  meet_ko: string
  /** index 0..4 = 정복 0~4 / 5~9 / 10~14 / 15~19 / 20팩 */
  awaken_ko: string[]
  golem: { name_ko: string; emoji: string; appear_ko: string; defeat_ko: string }
}

export interface VocabTier {
  tier: number
  name_ko: string
  concept_ko: string
  packs: string[]
  guardian?: VocabGuardian
}

export interface VocabData {
  version: number
  tiers: VocabTier[]
  packs: Record<string, VocabPack>
  story?: { title_ko: string; villain_ko: string; intro_ko: string; role_ko: string }
}

// ── v1.4.20 수호자 각성 ───────────────────────────────────────
/** 정복한 팩 수 → 각성 단계(0~4) */
export function awakenStage(doneInTier: number): number {
  return Math.max(0, Math.min(4, Math.floor(doneInTier / 5)))
}
export const AWAKEN_ICON = ['💤', '😪', '🧍', '✨', '🔥']
export const AWAKEN_NAME = ['잠듦', '눈을 떴다', '일어섰다', '힘을 되찾았다', '완전 각성']

// ── v1.4.20 단어 골렘 (팩 5개마다) ────────────────────────────
/** 이 티어에서 지금 소환되어 있는 골렘 번호(1~4). 없으면 0.
 *  팩을 5·10·15·20개 정복할 때마다 하나씩 나타나고, 잡으면 사라진다. */
export function golemId(tier: number, k: number): string { return `GOLEM-T${tier}-${k}` }
export function pendingGolem(progress: ProgressLike, tier: VocabTier): number {
  const done = tierDoneCount(progress, tier)
  for (let k = 1; k <= Math.floor(done / 5); k++) {
    if (!isPackDone(progress, golemId(tier.tier, k))) return k
  }
  return 0
}
/** 골렘 k가 몸에 박고 있는 단어들이 나온 팩 5개 */
export function golemPackIds(tier: VocabTier, k: number): string[] {
  return tier.packs.slice((k - 1) * 5, k * 5)
}

// ── 데이터 로딩 (지연 로드 — 단어 대륙에 들어갈 때만 받는다) ──
let _cache: VocabData | null = null
let _inflight: Promise<VocabData> | null = null
export function loadVocab(): Promise<VocabData> {
  if (_cache) return Promise.resolve(_cache)
  if (_inflight) return _inflight
  _inflight = fetch('/vocab.json', { cache: 'default' })
    .then(r => { if (!r.ok) throw new Error('vocab ' + r.status); return r.json() as Promise<VocabData> })
    .then(d => { _cache = d; return d })
    .finally(() => { _inflight = null })
  return _inflight
}
export function vocabCached(): VocabData | null { return _cache }

// ── 잠금 규칙 ────────────────────────────────────────────────
// 티어 1은 항상 열림. 티어 N은 티어 N-1의 팩을 16/20(80%) 이상 끝내면 열린다.
// 팩은 "앞에서부터 순서대로"가 아니라 **열린 팩 중에서 고르게** 한다(자율성).
// 구체적으로: 그 티어에서 아직 안 끝낸 팩 중 앞에서부터 3개가 동시에 열린다.
export const TIER_UNLOCK_RATIO = 0.8
export const OPEN_PACK_WINDOW = 3

export type PackState = 'done' | 'open' | 'locked'
type ProgressLike = Record<string, { status?: string } | undefined>

export function isPackDone(progress: ProgressLike, packId: string): boolean {
  const st = progress[packId]?.status
  return st === 'completed' || st === 'mastered'
}

export function tierDoneCount(progress: ProgressLike, tier: VocabTier): number {
  return tier.packs.filter(p => isPackDone(progress, p)).length
}

export function isTierOpen(progress: ProgressLike, tiers: VocabTier[], tier: number): boolean {
  if (tier <= 1) return true
  const prev = tiers.find(t => t.tier === tier - 1)
  if (!prev) return true
  return tierDoneCount(progress, prev) >= Math.ceil(prev.packs.length * TIER_UNLOCK_RATIO)
}

/** 티어 안에서 각 팩의 상태 — 안 끝낸 팩 중 앞 3개가 열린다. */
export function packStates(progress: ProgressLike, tiers: VocabTier[], tier: VocabTier): Record<string, PackState> {
  const out: Record<string, PackState> = {}
  const open = isTierOpen(progress, tiers, tier.tier)
  let opened = 0
  for (const p of tier.packs) {
    if (isPackDone(progress, p)) { out[p] = 'done'; continue }
    if (open && opened < OPEN_PACK_WINDOW) { out[p] = 'open'; opened++ }
    else out[p] = 'locked'
  }
  return out
}

// ── 문항 생성 ────────────────────────────────────────────────
// 5개 모드. 한 단어를 연속으로 같은 모드에 내지 않는다(교차 연습).
export type VocabMode =
  | 'meaning'   // 뜻 사냥 — 영어를 보고 한국어 뜻 고르기
  | 'listen'    // 소리 낚시 — 음원을 듣고 영어 단어 고르기
  | 'gap'       // 문장 구멍 — 예문의 빈칸에 들어갈 단어 고르기
  | 'spell'     // 철자 대장간 — 글자 타일을 순서대로 눌러 조립
  | 'recall'    // 한→영 소환 — 한국어를 보고 영어 고르기 (가장 어려운 인출)
  | 'speak'     // 소리 지르기 — 듣고 따라 말하기 (출력 가설, 블루프린트 원리 10)
  | 'sort'      // 분류 상자 — 12개를 한 화면에서 상자에 나눠 담기 (문항이 아니라 활동. buildQuestion은 만들지 않는다)

export const MODE_LABEL: Record<VocabMode, string> = {
  meaning: '뜻 사냥', listen: '소리 낚시', gap: '문장 구멍',
  spell: '철자 대장간', recall: '한→영 소환', speak: '소리 지르기', sort: '분류 상자',
}
export const MODE_EMOJI: Record<VocabMode, string> = {
  meaning: '🎯', listen: '🎣', gap: '🧩', spell: '🔨', recall: '🪄', speak: '📣', sort: '🗃️',
}

// ── v1.4.20 해금 곡선 — 기준을 '티어'에서 '누적 정복 팩 수'로 바꿨다 ──────────
// 왜 바꿨나(v1.4.19 → v1.4.20): 티어 기준이면 T2로 넘어가는 데 팩 16개가 필요하다.
//   = 예한이는 **첫 16팩 동안 똑같은 3가지 사냥법만** 본다. 우리가 잡으려던 지루함이 바로 거기 있었다.
//   누적 팩 기준으로 바꾸면 처음 7팩 동안 거의 매 팩마다 새로운 게 하나씩 열린다.
//   (게임 온보딩의 정석: 한 스테이지에 새 규칙 하나. 난이도는 여전히 티어가 담당한다.)
export const MODE_UNLOCK: { at: number; mode: VocabMode; name: string }[] = [
  { at: 0, mode: 'meaning', name: '뜻 사냥' },
  { at: 0, mode: 'listen',  name: '소리 낚시' },
  { at: 0, mode: 'spell',   name: '철자 대장간' },  // 첫 팩부터 — 첫 구역이 '탭만' 되면 첫인상이 죽는다
  { at: 1, mode: 'recall',  name: '한→영 소환' },
  { at: 4, mode: 'speak',   name: '소리 지르기' },
  { at: 6, mode: 'gap',     name: '문장 구멍' },
]

/** 문항 모드가 아닌 **한 화면짜리 활동**의 해금 (분류 상자·속사 사냥) */
export type VocabFeature = 'sort' | 'rapid'
export const FEATURE_UNLOCK: { at: number; feature: VocabFeature; name: string; emoji: string }[] = [
  { at: 2, feature: 'sort',  name: '분류 상자', emoji: '🗃️' },
  { at: 3, feature: 'rapid', name: '속사 사냥', emoji: '🔥' },
]
export function hasFeature(cleared: number, f: VocabFeature): boolean {
  const u = FEATURE_UNLOCK.find(x => x.feature === f)
  return !!u && cleared >= u.at
}

/** 손가락이 '4개 중 하나 탭'만 하는 모드 — 이 비율이 높으면 이름만 다르고 같은 게임이다. */
const TAP_MODES: VocabMode[] = ['meaning', 'listen', 'recall', 'gap']
/** 탭이 아닌 행동(조립·발화) */
const ACTIVE_MODES: VocabMode[] = ['spell', 'speak']
/** 지금까지 정복한 팩 수로 열려 있는 모드들 */
export function modesFor(cleared: number): VocabMode[] {
  return MODE_UNLOCK.filter(u => u.at <= cleared).map(u => u.mode)
}
/** 이번 팩에서 **새로** 열리는 것 (팩 시작 화면에서 알려준다).
 *  cleared = 이 팩을 시작하는 시점에 이미 정복한 팩 수. */
export function newUnlockAt(cleared: number): { name: string; emoji: string } | null {
  const m = MODE_UNLOCK.find(u => u.at === cleared && u.at > 0)
  if (m) return { name: m.name, emoji: MODE_EMOJI[m.mode] }
  const f = FEATURE_UNLOCK.find(u => u.at === cleared)
  return f ? { name: f.name, emoji: f.emoji } : null
}

export interface VocabQuestion {
  id: string
  mode: VocabMode
  word: VocabWord
  prompt: string          // 화면에 보여줄 문제 텍스트
  promptKo?: string       // 보조 설명
  options: string[]       // 4지선다 (spell 모드는 비어 있음)
  answer: string
  play?: { audio_url?: string; tts?: string }  // 자동/수동 재생 대상
  hints: string[]         // 3단계 힌트
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = (seed || 1) >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    // ⚠️ 2^31 모듈러 LCG의 **하위 비트는 주기가 짧다**(s % 4는 사실상 4주기로 반복).
    //    그대로 j = s % (i+1)을 쓰면 4지선다에서 정답 위치가 규칙적으로 몰려
    //    아이가 내용이 아니라 "위치"를 외워버린다(v1.4.16 스모크에서 18문항 연속 편향으로 적발).
    //    → xorshift로 비트를 섞고 상위 비트를 쓴다.
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    const j = Math.floor((s / 4294967296) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function hashOf(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 2147483647
  return h
}

/** 같은 팩의 다른 단어들에서 한국어 오답을 뽑는다 — 같은 의미장이라 자연스럽게 헷갈린다. */
function koDistractors(pack: VocabPack, w: VocabWord, seed: number): string[] {
  const pool = pack.words.filter(x => x.w !== w.w && x.ko !== w.ko).map(x => x.ko)
  return shuffle(pool, seed).slice(0, 3)
}

/** 철자 대장간 — 단어의 일부 글자를 가린다(길이에 비례, 최소 1개). */
function maskWord(w: string, seed: number): { masked: string; missing: string } {
  const letters = w.split('')
  const idxs = letters.map((c, i) => (/[a-z]/i.test(c) ? i : -1)).filter(i => i >= 0)
  const n = Math.max(1, Math.min(3, Math.floor(idxs.length / 4)))
  const pick = shuffle(idxs, seed).slice(0, n).sort((a, b) => a - b)
  const masked = letters.map((c, i) => (pick.includes(i) ? '_' : c)).join('')
  return { masked, missing: pick.map(i => letters[i]).join('') }
}

/** 철자 타일용 미끼 글자 — 정답 글자와 헷갈릴 만한 인접 알파벳 */
function decoyLetters(missing: string, seed: number): string[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const near = missing.split('').flatMap(ch => {
    const i = alphabet.indexOf(ch.toLowerCase())
    return i < 0 ? [] : [alphabet[(i + 3) % 26], alphabet[(i + 20) % 26]]
  })
  const n = Math.max(2, Math.min(4, missing.length + 1))
  return shuffle(Array.from(new Set(near)), seed).slice(0, n)
}

function playOf(w: VocabWord): { audio_url?: string; tts?: string } {
  return { audio_url: w.audio_url, tts: w.tts || w.w }
}
function playExOf(w: VocabWord): { audio_url?: string; tts?: string } {
  return { audio_url: w.audio_ex_url || w.audio_url, tts: w.ex }
}

export function buildQuestion(pack: VocabPack, w: VocabWord, mode: VocabMode, nonce: number): VocabQuestion {
  const seed = hashOf(w.w + mode) + nonce
  const base = { id: `${pack.pack_id}:${w.w}:${mode}`, mode, word: w }
  const hint3 = [
    `${w.pos === 'n' ? '이름을 나타내는 말(명사)' : w.pos === 'v' ? '움직임을 나타내는 말(동사)' : w.pos === 'adj' ? '꾸며주는 말(형용사)' : w.pos === 'adv' ? '동사를 돕는 말(부사)' : '기능을 하는 말'}이야.`,
    `첫 글자는 "${w.w[0]}" 로 시작해.`,
    w.hint_ko,
  ]
  switch (mode) {
    case 'meaning': {
      const opts = shuffle([w.ko, ...koDistractors(pack, w, seed)], seed)
      return { ...base, prompt: w.w, promptKo: '무슨 뜻일까?', options: opts, answer: w.ko, play: playOf(w), hints: hint3 }
    }
    case 'listen': {
      const opts = shuffle([w.w, ...w.distractors.slice(0, 3)], seed)
      return { ...base, prompt: '🔊', promptKo: '잘 듣고 어떤 단어인지 골라!', options: opts, answer: w.w, play: playOf(w), hints: hint3 }
    }
    case 'gap': {
      const re = new RegExp(`\\b${w.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      const blanked = re.test(w.ex) ? w.ex.replace(re, '_____') : w.ex
      const opts = shuffle([w.w, ...w.distractors.slice(0, 3)], seed)
      return { ...base, prompt: blanked, promptKo: w.ex_ko, options: opts, answer: w.w, play: playExOf(w), hints: hint3 }
    }
    case 'spell': {
      // v1.4.19: 빈칸 타이핑 → **글자 타일 조립**. 모바일에서 키보드가 올라오지 않고, 손이 하는 일이 달라진다.
      const { masked, missing } = maskWord(w.w, seed)
      const pool = shuffle([...missing.split(''), ...decoyLetters(missing, seed)], seed + 7)
      return {
        ...base, prompt: masked, promptKo: `${w.ko} — 빠진 글자를 순서대로 눌러!`,
        options: pool, answer: missing, play: playOf(w), hints: hint3,
      }
    }
    case 'speak': {
      // 출력 가설(원리 10). 채점은 아이 스스로 — 정직하게 고르게 하고 감점은 없다.
      return {
        ...base, prompt: w.w, promptKo: `듣고 세 번 따라 말해봐! (${w.ko})`,
        options: [], answer: w.w, play: playOf(w), hints: hint3,
      }
    }
    case 'recall':
    default: {
      const opts = shuffle([w.w, ...w.distractors.slice(0, 3)], seed)
      return { ...base, prompt: w.ko, promptKo: '영어로는?', options: opts, answer: w.w, play: playOf(w), hints: hint3 }
    }
  }
}

/** 한 팩의 플레이 문항 목록.
 *  · 모르는 단어  = 서로 다른 모드 2문항 (교차 연습)
 *  · 아는 단어    = 확인용 1문항 (지루하지 않게 딱 한 번)
 *  · 같은 단어가 연달아 나오지 않도록 섞는다.
 *  · 총 문항 수는 28개를 넘지 않게 자른다(집중 15~20분 안에 끝나야 한다). */
export const MAX_QUESTIONS = 28

/** v1.4.19 — 지금 열린 모드만으로 짝을 만든다.
 *  같은 단어를 **서로 다른 두 방식**으로 인출하게 해야 교차 연습이 실제로 일어난다
 *  (v1.4.18까지는 이름만 다르고 83%가 '4개 중 탭'이었다). */
function modePairsFor(cleared: number): VocabMode[][] {
  const avail = modesFor(cleared)
  const taps = TAP_MODES.filter(m => avail.includes(m))
  const acts = ACTIVE_MODES.filter(m => avail.includes(m))
  if (!acts.length) return taps.length > 1 ? [[taps[0], taps[1]]] : [['meaning', 'listen']]
  // ★핵심 규칙★ 한 단어의 두 문항은 **반드시 서로 다른 종류의 행동**이어야 한다.
  //   고르기(탭) 하나 + 조립/말하기 하나 → 팩 전체의 탭 비율이 자동으로 50%가 된다.
  //   (v1.4.18까지는 이름만 다르고 83%가 탭이었다 — Dio님이 "진부하다"고 느낀 실체.)
  const pairs: VocabMode[][] = []
  for (const t of taps) for (const a of acts) pairs.push([t, a])
  return pairs
}

/** 한 팩의 플레이 문항 목록.
 *  · 모르는 단어  = 서로 다른 모드 2문항 (교차 연습)
 *  · 아는 단어    = 확인용 1문항 (지루하지 않게 딱 한 번)
 *  · 같은 단어가 연달아 나오지 않도록 섞는다.
 *  · 총 문항 수는 28개를 넘지 않게 자른다(집중 15~20분 안에 끝나야 한다). */
export function buildSession(pack: VocabPack, knownWords: string[], cleared = 99, cap = MAX_QUESTIONS): VocabQuestion[] {
  const known = new Set(knownWords)
  const pairs = modePairsFor(cleared)
  const avail = modesFor(cleared)
  const confirmModes: VocabMode[] = avail.includes('recall') ? ['meaning', 'recall'] : ['meaning', 'listen']
  const qs: VocabQuestion[] = []
  pack.words.forEach((w, i) => {
    if (known.has(w.w)) {
      qs.push(buildQuestion(pack, w, confirmModes[i % confirmModes.length], i))
    } else {
      pairs[i % pairs.length].forEach((m, k) => qs.push(buildQuestion(pack, w, m, i * 10 + k)))
    }
  })
  // 같은 단어가 붙어 나오지 않도록 재배치
  const mixed = shuffle(qs, hashOf(pack.pack_id))
  for (let i = 1; i < mixed.length; i++) {
    if (mixed[i].word.w === mixed[i - 1].word.w) {
      const j = mixed.findIndex((q, k) => k > i && q.word.w !== mixed[i - 1].word.w && q.word.w !== (mixed[i + 1]?.word.w))
      if (j > 0) { const t = mixed[i]; mixed[i] = mixed[j]; mixed[j] = t }
    }
  }
  return mixed.slice(0, cap)
}

/** 분류 상자가 붙는 팩은 문항 수를 줄인다 — 한 세션 15~20분 예산은 그대로 지켜야 한다.
 *  (분류 12칩은 문항 12개보다 훨씬 빠르지만, 그래도 총량은 관리한다.) */
export const MAX_QUESTIONS_WITH_SORT = 20

// ── v1.4.20 ① 분류 상자 🗃️ ──────────────────────────────────
// 왜 만들었나: v1.4.19까지 손이 하는 일은 '고르기·조립·말하기' 셋뿐이었고, 그중 고르기가 절반이었다.
// **분류(categorize)** 는 네 번째 행동이자, 인지적으로 성격이 다르다 —
// 아이가 단어를 하나씩 맞히는 대신 **12개를 한 화면에서 견주며 공통점·차이를 스스로 찾아낸다**
// (귀납 학습: 규칙을 설명해 주지 않고 예문에서 발견하게 한다 — 블루프린트 원리 6).
// 그리고 이 팩의 12단어가 사실은 '이름을 나타내는 말'과 '움직임을 나타내는 말'이 섞여 있다는 것을
// 아이가 직접 나누어 보는 순간, GIU Basic의 뼈대인 **품사 감각**이 공짜로 따라온다.

const POS_BOX: Record<string, string> = {
  n: '이름 상자 📦', v: '움직임 상자 🏃', adj: '꾸밈 상자 🎨',
  adv: '도움 상자 🎛️', prep: '자리 상자 🧭', conj: '이음 상자 🔗',
  pron: '대신 상자 🪞', det: '가리킴 상자 👉', num: '숫자 상자 🔢',
  phr: '덩어리 상자 🧩',   // 한 단어가 아니라 통째로 쓰는 표현
}
function posBoxOf(pos: string): string | null {
  const key = (pos || '').toLowerCase().split(/[/,]/)[0].trim()
  return POS_BOX[key] || null
}

/** IPA에서 모음 덩어리 수 = 음절 수. 이중모음(aɪ·oʊ…)은 붙어 있으므로 한 덩어리로 세어진다. */
const IPA_VOWELS = 'aeiouæɑɔəɛɪʊʌɜɒøyɐœɤɯ'
function syllablesOf(w: VocabWord): number {
  const src = (w.ipa || '').toLowerCase()
  let n = 0, inV = false
  for (const ch of src) {
    const isV = IPA_VOWELS.includes(ch)
    if (isV && !inV) n++
    inV = isV
  }
  if (n) return n
  // ipa가 없거나 이상하면 철자로 근사 (연속 모음 = 1, 끝의 묵음 e 제외)
  const s = w.w.toLowerCase().replace(/e\b/, '')
  return Math.max(1, (s.match(/[aeiouy]+/g) || []).length)
}
const SYL_BOX = ['1번 상자 👏', '2번 상자 👏👏', '3번 이상 상자 👏👏👏']
function sylBoxOf(w: VocabWord): string {
  return SYL_BOX[Math.min(2, Math.max(1, syllablesOf(w)) - 1)]
}

export interface SortTask {
  /** 이번 분류의 기준 설명 (아이에게 보여 줄 한 줄) */
  rule_ko: string
  /** 이 분류가 무엇을 가르치는가 (확인 후 한 줄로 짚어 준다 — 귀납 → 명시화) */
  lesson_ko: string
  /** 상자 이름들 (2~3개) */
  boxes: string[]
  /** 상자에 넣을 단어들 */
  items: { w: string; ko: string; box: string; audio_url?: string; tts?: string }[]
}

/** 그룹핑 결과를 분류 과제로 다듬는다.
 *  · 1개짜리 그룹은 버린다(혼자 있는 상자는 생각할 거리가 없다)
 *  · 상자는 최대 3개까지만 — 모바일 한 화면에 들어가야 한다
 *  · 남은 단어가 6개 미만이면 이 기준은 포기 */
function shapeSort(pack: VocabPack, boxOf: (w: VocabWord) => string | null, rule: string, lesson: string, seed: number): SortTask | null {
  const groups = new Map<string, VocabWord[]>()
  for (const w of pack.words) {
    const b = boxOf(w)
    if (!b) continue
    if (!groups.has(b)) groups.set(b, [])
    groups.get(b)!.push(w)
  }
  const entries = [...groups.entries()].filter(e => e[1].length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 3)
  if (entries.length < 2) return null
  const used = entries.flatMap(e => e[1].map(w => ({ w, box: e[0] })))
  if (used.length < 6) return null
  const boxes = entries.map(e => e[0])
  const items = shuffle(used, hashOf(pack.pack_id + 'sort') + seed)
    .map(x => ({ w: x.w.w, ko: x.w.ko, box: x.box, audio_url: x.w.audio_url, tts: x.w.tts || x.w.w }))
  // 상자 순서는 고정 규칙(음절)이면 그대로, 아니면 섞는다
  return { rule_ko: rule, lesson_ko: lesson, boxes: boxes[0].startsWith('1번') || boxes.some(b => b.startsWith('2번')) ? SYL_BOX.filter(b => boxes.includes(b)) : shuffle(boxes, hashOf(pack.pack_id) + 3), items }
}

/** 이 팩의 분류 상자.
 *  ① 품사가 2종 이상 섞여 있으면 **품사**로 나눈다 (GIU Basic의 뼈대 — 가장 가치가 크다)
 *  ② 전부 같은 품사면 **음절 수**로 나눈다 (손뼉으로 세는 소리 인식 — 듣기·발음의 토대)
 *  둘 다 안 되면 이 팩은 분류 상자를 쓰지 않는다. */
export function buildSortTask(pack: VocabPack, seed = 0): SortTask | null {
  const byPos = shapeSort(
    pack, w => posBoxOf(w.pos),
    '이 단어들, 사실 종류가 달라. 상자에 나눠 담아 봐 — 틀려도 감점 없어!',
    '영어 문장은 이 상자들을 순서대로 끼워서 만든다. 지금 나눈 게 그 뼈대야.',
    seed,
  )
  if (byPos) return byPos
  return shapeSort(
    pack, w => sylBoxOf(w),
    '이번엔 소리로 나눠 보자. 손뼉을 쳐 보고 몇 번에 끊기는지로 담아 봐 — 틀려도 감점 없어!',
    '음절이 몇 개인지 느껴지면 듣기가 편해지고, 발음도 자연스럽게 붙는다.',
    seed,
  )
}

// ── v1.4.20 ② 속사 사냥 🔥 ──────────────────────────────────
// 팩을 끝낸 뒤 **선택**으로 들어가는 45초 라운드. 단어와 뜻을 짝지어 보여 주고 ⭕/❌만 누른다.
// 목적은 정확도가 아니라 **유창성(automaticity)** — 아는 것을 '빨리' 꺼내는 훈련이다.
// ⚠️ 의도적으로 **기록하지 않는다**(answer_events·XP 없음). 속도 게임을 점수에 넣으면
//    ① 관제실 정답률이 오염되고 ② 아이가 급하게 찍는 습관을 보상받는다.
export interface RapidItem { w: string; ko: string; isMatch: boolean }

/** ⚠️ 진짜 짝의 비율을 **확률에 맡기지 않는다**(L24의 재판).
 *  해시로 55%를 뽑았더니 어떤 팩은 24장 중 20장이 ⭕가 됐다 — 그러면 아이는 단어를 안 보고
 *  ⭕만 연타하는 게 최적 전략이 된다. 그래서 매 라운드 **정확히 7/12**를 짝으로 만들어 둔다.
 *  두 바퀴의 짝 조합은 서로 다르게 잡아 1바퀴를 외워서 2바퀴를 푸는 것도 막는다. */
function rapidHalf(pack: VocabPack, seed: number): RapidItem[] {
  const ws = pack.words
  const order = shuffle(ws, seed)
  const matchCount = Math.round(ws.length * 0.58)   // 12개 중 7개
  return order.map((w, i) => {
    if (i < matchCount) return { w: w.w, ko: w.ko, isMatch: true }
    const pool = ws.filter(x => x.ko !== w.ko)
    const other = pool[(hashOf(w.w) + seed + i) % Math.max(1, pool.length)]
    return { w: w.w, ko: (other || ws[0]).ko, isMatch: false }
  })
}
export function buildRapidRound(pack: VocabPack, seed: number): RapidItem[] {
  // 24장 — 45초 안에 다 못 푸는 게 정상이다(끝까지 밀어붙이게 하는 장치).
  return shuffle([...rapidHalf(pack, seed + 11), ...rapidHalf(pack, seed + 29)], seed + 7)
}
export const RAPID_SECONDS = 45

// ── v1.4.20 ③ 단어 골렘 보스전 ⚔️ ────────────────────────────
// 팩 5개마다 나타난다. 몸에 박힌 단어 = **직전 5팩에서 잡은 것들**(60단어 중 12개).
// 왜 이게 교육적으로 옳은가: 팩을 끝낸 직후가 아니라 **몇 팩 지난 뒤에** 다시 만나므로
// 간격 반복이 되고, 다섯 팩에서 섞어 뽑으므로 교차 연습(interleaving)이 된다.
// 실패는 없다 — 틀리면 골렘이 그 단어를 다시 삼키고, 그 문항이 **큐 맨 뒤로** 돌아온다(완전 학습).
export function buildGolemSession(packs: VocabPack[], cleared: number, seed: number): VocabQuestion[] {
  // ⚠️ 'speak'(스스로 채점)는 보스전에서 뺀다 — 자기 채점으로는 갑옷이 공짜로 깨진다.
  const avail = modesFor(cleared).filter(m => m !== 'speak')
  const picked: { w: VocabWord; pack: VocabPack }[] = []
  // 다섯 팩에서 균등하게 — 팩당 2~3개
  packs.forEach((p, pi) => {
    const per = pi < 12 % Math.max(1, packs.length) ? Math.ceil(12 / packs.length) : Math.floor(12 / packs.length)
    shuffle(p.words, hashOf(p.pack_id) + seed).slice(0, per).forEach(w => picked.push({ w, pack: p }))
  })
  const twelve = shuffle(picked, seed + 5).slice(0, 12)
  return twelve.map((x, i) => {
    const mode = avail[(hashOf(x.w.w) + i) % avail.length]
    const q = buildQuestion(x.pack, x.w, mode, seed + i * 13)
    return { ...q, id: `golem:${x.w.w}:${mode}` }
  })
}

/** 팩 결과 → 별점 (모듈과 같은 기준: 90+ ★★★ / 70+ ★★ / 그 외 0) */
export function starsFor(pct: number): number {
  if (pct >= 90) return 3
  if (pct >= 70) return 2
  return 0
}

/** 복습 카드 시드 — 팩의 12단어를 라이트너에 넣는다.
 *  아는 단어(사전 스캔 통과)는 박스 3부터 시작해 불필요한 반복을 건너뛴다. */
export function reviewCardsFor(pack: VocabPack, knownWords: string[]): {
  card_id: string; card_front: string; card_back: string; box: number; tts: string
}[] {
  const known = new Set(knownWords)
  return pack.words.map(w => ({
    card_id: `vocab:${w.w}`,
    card_front: w.w,
    card_back: `${w.ko}\n${w.ex}`,
    box: known.has(w.w) ? 3 : 1,
    tts: w.tts || w.w,
  }))
}
