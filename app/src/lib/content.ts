// 콘텐츠 로더 — CONTENT_SPEC v1.0 계약 타입
// 배포본은 단일 /content.json (7/14 평탄화 — 모듈·진단 JSON을 1회 fetch 후 메모리 인덱싱)
import { APP_VERSION } from './version'
export interface TtsText {
  tts?: string | null
  // v1.3.0 오디오 계약(CONTRACT v1.3 §9): audio_url 있으면 진짜 음성 클립 재생, 실패 시 tts 폴백
  audio_url?: string | null
  voice?: string | null
}

export interface StoryLine { speaker: string; emoji?: string; text_ko: string; text_en?: string | null }
export interface LearnExample extends TtsText { en: string; ko: string }
export interface LearnCard { title_ko: string; rule_ko: string; examples: LearnExample[]; tip_ko?: string; art_key?: string }
export interface ChoiceItem extends TtsText {
  id: string; q_ko: string; choices: string[]; answer_idx: number; explain_ko: string
  meme_correct?: string; meme_wrong?: string
}
export interface MatchPair extends TtsText { left: string; right: string }
/**
 * 블록 조립 문항.
 *
 * ★`alt_answers` — v1.4.35 추가 (옛 월드 7~10 = 지금의 6~9, 적대적 검증에서 확인된 결함 봉합)★
 *   같은 토큰으로 **문법적으로 똑같이 맞는 다른 어순**이 나오는 문항이 30개 넘게 있었다.
 *   예: "I watched TV last night" ↔ "Last night I watched TV" — 둘 다 옳은 영어다.
 *   그런데 채점이 `answer` 문자열 하나만 비교해서, **맞게 조립한 아이가 틀렸다는 피드백을 받았다.**
 *   오답 처리 자체보다 나쁜 건 아이가 "내가 아는 게 틀렸나?" 하고 옳은 지식을 버리는 것이다.
 *   → 진짜로 옳은 대안 어순은 `alt_answers`에 적어 두고 함께 정답으로 인정한다.
 *   ※ 어순 자체가 학습 목표인 문항(예: 의문문 도치)에는 **넣지 않는다** — 그건 오답이 맞다.
 */
export interface OrderItem extends TtsText {
  id: string; prompt_ko: string; tokens: string[]; answer: string; ko?: string
  alt_answers?: string[]
}

/* ─── v1.4.24 문장 소환 — 월드 6 전용 화면을 없애고 문법 단원의 한 스텝으로 녹였다 ─────────
   왜 옮겼나: 독립 기능으로 두면 커리큘럼이 늘 때마다 그 화면 하나가 끝없이 길어지고,
   결국 아이가 안 들어가는 방이 된다. 배운 문법을 그 자리에서 조립해 실행해 보는 것이
   원래 이 기능이 하려던 일이므로, 배운 직후에 두는 것이 맞다.
   ★ 커리큘럼을 확장할 때: 문법을 다루는 새 단원에는 `summon` 스텝 1개(문항 3개)를 반드시 넣는다. */
export type SummonActor = 'zombie' | 'bomb' | 'cake' | 'dog' | 'cat'
export type SummonVerb =
  | 'jump' | 'run' | 'eat' | 'sleep' | 'dance' | 'fly'
  | 'cry' | 'laugh' | 'spin' | 'fall' | 'explode' | 'hug'
/** 문장을 무대에서 그대로 재현하기 위한 배역표. 없으면 '문장 각인' 연출로 간다(거짓 연출 금지). */
export interface SummonScene { actor: SummonActor; verb: SummonVerb; object?: SummonActor; speed?: number }
export interface SummonItem extends TtsText {
  id: string
  ko: string                 // 미션(한국어 뜻) — 이걸 보고 영어로 조립한다
  tokens: string[]           // 조립 블록(오답 블록 포함 가능). 정답 토큰만 공백으로 이으면 answer
  answer: string             // 정답 문장 (마침표 없음)
  alt_answers?: string[]     // v1.4.35 — 문법적으로 똑같이 옳은 다른 어순(OrderItem 주석 참조)
  focus_ko?: string          // 이 단원의 문법 초점 — 틀렸을 때 주는 힌트
  explain_ko?: string        // 정답 후 한 줄 해설
  scene?: SummonScene
}

export type Step =
  | { type: 'story'; lines: StoryLine[] }
  | { type: 'learn'; card: LearnCard }
  | { type: 'game'; kind: 'choice' | 'listen_choice'; prompt_ko?: string; items: ChoiceItem[] }
  | { type: 'game'; kind: 'match'; prompt_ko?: string; items: { pairs: MatchPair[] }[] | { pairs: MatchPair[] } }
  | { type: 'game'; kind: 'order'; prompt_ko?: string; items: OrderItem[] }
  | { type: 'summon'; prompt_ko?: string; items: SummonItem[] }   // v1.4.24
  | { type: 'quiz'; questions: ChoiceItem[] }
  | { type: 'speak'; mission_ko: string; target_en: string; tts: string; audio_url?: string | null }

export interface ReviewCardDef extends TtsText { card_id: string; front: string; back: string }

/** v1.3.0 수정 동굴 룬 도감 항목 (CONTRACT v1.3 §11) */
export interface RuneDef extends TtsText {
  ipa: string; name_ko: string; example: string; example_ko?: string; tip_ko?: string; art_key?: string
}

export interface ModuleDef {
  module_id: string; world: number; order: number
  title_ko: string; subtitle_ko?: string; emoji: string
  xp_module_clear: number; estimated_minutes: number
  steps: Step[]; review_cards: ReviewCardDef[]
  boss: { title_ko: string; intro_ko?: string; questions: ChoiceItem[] }
  runes?: RuneDef[] // 수정 동굴(R*) 전용 — 완료 시 도감에 수집
}

/** v1.3.0 유령 보스 (CONTRACT v1.3 §8) */
export interface GhostDef {
  module_id: string; title_ko: string; intro_ko: string
  intro_audio_url?: string | null
  taunt_correct?: string[]; taunt_wrong?: string[]
  questions: ChoiceItem[]
}

/* v1.4.0~v1.4.23에 있던 ForgeDef(월드 6 전용 소환진 콘텐츠)는 v1.4.24에서 제거했다.
   소환 문항은 이제 각 모듈의 `summon` 스텝 안에 산다. 예한이의 기존 기록(activity_type 'forge',
   module_id 'FORGE', xp reason forge_discover)은 그대로 보존된다 — 관제실 라벨도 유지(L17). */

/** v1.3.0 리스닝 아케이드 (CONTRACT v1.3 §10) */
export interface EchoItem extends TtsText { id: string; play: string; q_ko: string; choices: string[]; answer_idx: number; explain_ko: string; ko_map?: string[] }
export interface EchoSet { id: string; title_ko: string; focus_ko?: string; items: EchoItem[] }
export interface CommandItem extends TtsText { id: string; play: string; q_ko: string; choices: string[]; answer_idx: number; explain_ko: string }
export interface ListeningDef { echo_sets: EchoSet[]; commands: CommandItem[] }

export interface DiagQuestion extends ChoiceItem { kind?: 'choice' | 'listen_choice' | 'order'; tokens?: string[]; answer?: string; prompt_ko?: string }
export interface DiagDef {
  diag_id: string; title_ko: string; emoji: string; intro_ko: string
  questions: DiagQuestion[]
  scoring: { bands: { min_pct: number; label_ko: string; start_module: string }[] }
}

// v1.2.0 확장: 문법 성 +C7, 동사 사냥터 +B22a/B22b, 생존 캠프 +D2S/D3S, 월드5 시제 시간여행 오픈
// v1.3.0 확장: 월드 1.5 수정 동굴(R0~R9, 발음기호 마스터) — A4(월드1) 클리어로 잠금 해제
export const RUNE_MODULES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']
export const WORLDS = [
  { world: 1, name_ko: '소리 광산', emoji: '⛏️', modules: ['A1', 'A2', 'A3', 'A4'] },
  { world: 1.5, name_ko: '수정 동굴', emoji: '💎', modules: RUNE_MODULES },
  { world: 2, name_ko: '문법 성', emoji: '🏰', modules: ['C0', 'C5', 'C6', 'C7'] },
  { world: 3, name_ko: '동사 사냥터', emoji: '🏹', modules: ['B21a', 'B21b', 'B22a', 'B22b'] },
  { world: 4, name_ko: '생존 캠프', emoji: '🏕️', modules: ['D1S', 'D2S', 'D3S'] },
  { world: 5, name_ko: '시제 시간여행', emoji: '⏳', modules: ['T1', 'T2', 'T3'] },
  // v1.4.24 — '문장 소환진 공방'(옛 월드 6, 독립 화면)은 제거했다. 소환은 이제 문법 단원 안의 스텝이다.
  // ★v1.4.42 — 그래서 6번이 비어 있었다. Dio님 지시로 뒤의 월드를 한 칸씩 당겨 6~9로 다시 번호를 붙였다.
  //   (번호만 바뀐다. module_id P/W/S/G는 그대로라 예한이 학습 기록에는 아무 영향이 없다.)
]
export const MODULE_ORDER = ['A1', 'A2', 'A3', 'A4', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'C0', 'C5', 'C6', 'C7', 'B21a', 'B21b', 'B22a', 'B22b', 'D1S', 'D2S', 'D3S', 'T1', 'T2', 'T3']

/* ─── v1.4.23 확장 월드 (선행 개발 — Dio님 승인 전까지 노출 금지) ─────────────────
   콘텐츠·코드는 배포하되 **보이지 않는다**. 스위치는 서버의 `version.json.worlds_ready` 하나.
   왜 이렇게 하나: MODULE_ORDER에 그냥 24개를 이어붙이면 예한이 화면의 "클리어 n/28"이
   조용히 "n/52"로 바뀐다. 아이 입장에서 그건 어느 날 갑자기 진도가 반토막 나는 경험이다.
   그래서 기준선(WORLDS·MODULE_ORDER)은 건드리지 않고, 접근자에서 합친다.

   ★v1.4.42 번호 정정★ 옛 월드 6(문장 소환진)이 해체돼 6번이 비어 있었고,
   아이 화면에 5 다음이 7로 건너뛰어 보였다. 7~10 → **6~9**로 한 칸씩 당겼다.
   ┌ 옛 → 새 ┐  7→6 독해 던전 · 8→7 어휘 대장간 · 9→8 회화 아레나 · 10→9 서술 마스터리
   여기 `world` 숫자가 **단일 원천**이다 — 화면 라벨도, `world{N}_clear` 뱃지 ID도 여기서 나온다.
   module_id(P/W/S/G)는 손대지 않았으므로 DB 기록·복습 카드·진도는 전혀 영향받지 않는다. */
export const EXT_WORLDS = [
  { world: 6, name_ko: '독해 던전', emoji: '📖', modules: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] },
  { world: 7, name_ko: '어휘 대장간', emoji: '🔨', modules: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'] },
  { world: 8, name_ko: '회화 아레나', emoji: '💬', modules: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
  { world: 9, name_ko: '서술 마스터리', emoji: '✍️', modules: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] },
]
export const EXT_MODULE_ORDER = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'W1', 'W2', 'W3', 'W4', 'W5', 'W6',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
]
const EXT_SET = new Set(EXT_MODULE_ORDER)
/** ★v1.4.40★ 이 module_id가 '진도(모듈 52개)'에 잡히는가.
 *  어휘 팩(V1-01)·단어 골렘(GOLEM-T1-1)·진단(DIAG-D1)은 진도바가 아니라 각자 화면에서 센다.
 *  그 밖의 것(지령 미션 CMD·에코 사냥 ECHO·문장 소환진 FORGE·복습 REVIEW)이 **진도 밖 학습**이다. */
const TRACKED = new Set([...MODULE_ORDER, ...EXT_MODULE_ORDER])
export function isOffTrackModuleId(id: string): boolean {
  if (TRACKED.has(id)) return false
  if (id.startsWith('DIAG-') || /^D\d$/.test(id)) return false
  if (/^V\d{1,2}-\d{2}$/.test(id)) return false
  if (/^GOLEM-T\d{1,2}-\d$/.test(id)) return false
  return true
}
/** 확장 월드(6~9)에 속한 모듈인가 (승인 전에는 아이 화면 어디에도 나오면 안 된다) */
export const isExtModule = (id: string) => EXT_SET.has(id)
/** 화면이 쓰는 월드 목록 — ready가 아니면 기준선(월드 1~6)만 */
export const worldList = (ready?: boolean) => (ready ? [...WORLDS, ...EXT_WORLDS] : WORLDS)
/** 화면이 쓰는 모듈 순서 — ready가 아니면 기준선 28개만 */
export const moduleOrder = (ready?: boolean) => (ready ? [...MODULE_ORDER, ...EXT_MODULE_ORDER] : MODULE_ORDER)
export const DIAG_ORDER = ['D1', 'D2', 'D3', 'D4']
/** 진단 배정(placement)은 R 모듈이 없던 시절 규칙 — R 모듈은 배정 자동 해제에서 제외하고 자체 순서 잠금만 따른다 */
export const isRuneModule = (id: string) => /^R\d$/.test(id)

interface ContentBundle {
  modules: Record<string, ModuleDef>
  diagnostics: Record<string, DiagDef>
  ghost?: Record<string, GhostDef>      // v1.3.0
  listening?: ListeningDef              // v1.3.0
}

let bundlePromise: Promise<ContentBundle> | null = null

/**
 * 단일 content.json 1회 fetch — 이후 모든 모듈/진단은 메모리에서 반환
 *
 * ★주소에 앱 버전을 붙인다 (v1.4.35 제정 — L38의 반복 방지)★
 *   그림 자산에서 이미 겪은 일이다: 파일만 갈아끼우면 CDN·WebView가 옛 것을 계속 쓴다.
 *   내용을 고쳐 놓고 아이 폰에서는 안 바뀌면, 고친 것이 아니다.
 *   배포할 때마다 APP_VERSION이 오르므로 주소가 바뀌고 → 새 콘텐츠를 반드시 받는다.
 */
function loadContent(): Promise<ContentBundle> {
  if (!bundlePromise) {
    bundlePromise = fetch(`/content.json?v=${APP_VERSION}`).then(res => {
      if (!res.ok) throw new Error(`콘텐츠를 불러오지 못했어 (${res.status})`)
      return res.json() as Promise<ContentBundle>
    })
  }
  return bundlePromise
}

export const loadModule = (id: string) =>
  loadContent().then(c => {
    const m = c.modules[id]
    if (!m) throw new Error(`모듈 ${id}을(를) 찾지 못했어`)
    return m
  })

export const loadDiag = (id: string) =>
  loadContent().then(c => {
    const d = c.diagnostics[id]
    if (!d) throw new Error(`진단 ${id}을(를) 찾지 못했어`)
    return d
  })

// v1.3.0 로더
export const loadGhost = (moduleId: string) =>
  loadContent().then(c => {
    const g = c.ghost?.[moduleId]
    if (!g) throw new Error(`유령 보스 ${moduleId}을(를) 찾지 못했어`)
    return g
  })

export const loadListening = () =>
  loadContent().then(c => {
    if (!c.listening) throw new Error('리스닝 콘텐츠를 찾지 못했어')
    return c.listening
  })
