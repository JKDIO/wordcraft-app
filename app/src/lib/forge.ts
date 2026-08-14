// v1.4.0 문장 소환진 — 문법 검증 엔진 (CONTRACT §12)
// 핵심: "조립한 문장이 그대로 실행된다" + 3단 피드백(비문=진단 / 문법OK·미션불일치=실행+대조 / 정답=풀XP)
// 교육 원칙: 비문 진단은 "영어나라 헌법"(제1조 어순·제2조 주어·제5조 동사 종족)과 C7 왕관(-s) 언어로 설명한다.

export type ActorKey = 'zombie' | 'bomb' | 'cake' | 'dog' | 'cat'
export type VerbKey = 'jump' | 'run' | 'eat' | 'sleep' | 'dance' | 'fly' | 'cry' | 'laugh' | 'spin' | 'fall' | 'explode' | 'hug'

export interface SubjectDef { token: string; actor: ActorKey; ko: string }
export interface VerbDef { key: VerbKey; base: string; s3: string; ko: string; needsObject?: boolean; allowObject?: boolean }
export interface ObjectDef { token: string; actor: ActorKey; ko: string }
export interface AdverbDef { token: string; ko: string; speed: number }

export const SUBJECTS: SubjectDef[] = [
  { token: 'The zombie', actor: 'zombie', ko: '좀비' },
  { token: 'The monster', actor: 'bomb', ko: '폭탄몬' },
  { token: 'The cake', actor: 'cake', ko: '케이크' },
  { token: 'The dog', actor: 'dog', ko: '강아지' },
  { token: 'The cat', actor: 'cat', ko: '고양이' },
]

export const VERBS: VerbDef[] = [
  { key: 'jump', base: 'jump', s3: 'jumps', ko: '점프하다' },
  { key: 'run', base: 'run', s3: 'runs', ko: '달리다' },
  { key: 'eat', base: 'eat', s3: 'eats', ko: '먹다', allowObject: true },
  { key: 'sleep', base: 'sleep', s3: 'sleeps', ko: '자다' },
  { key: 'dance', base: 'dance', s3: 'dances', ko: '춤추다' },
  { key: 'fly', base: 'fly', s3: 'flies', ko: '날다' },
  { key: 'cry', base: 'cry', s3: 'cries', ko: '울다' },
  { key: 'laugh', base: 'laugh', s3: 'laughs', ko: '웃다' },
  { key: 'spin', base: 'spin', s3: 'spins', ko: '돌다' },
  { key: 'fall', base: 'fall', s3: 'falls', ko: '넘어지다' },
  { key: 'explode', base: 'explode', s3: 'explodes', ko: '폭발하다' },
  { key: 'hug', base: 'hug', s3: 'hugs', ko: '안아주다', needsObject: true },
]

export const OBJECTS: ObjectDef[] = [
  { token: 'the cake', actor: 'cake', ko: '케이크를' },
  { token: 'the monster', actor: 'bomb', ko: '폭탄몬을' },  // v1.4.2 실험실 사례 반영
  { token: 'the dog', actor: 'dog', ko: '강아지를' },
  { token: 'the cat', actor: 'cat', ko: '고양이를' },
  { token: 'the zombie', actor: 'zombie', ko: '좀비를' },
]

export const ADVERBS: AdverbDef[] = [
  { token: 'fast', ko: '빠르게', speed: 1.7 },
  { token: 'slowly', ko: '천천히', speed: 0.55 },
]

export interface Parse { subject: SubjectDef; verb: VerbDef; object?: ObjectDef; adverb?: AdverbDef }
export type ForgeVerdict =
  | { kind: 'ok'; parse: Parse; sentence: string }
  | { kind: 'broken'; brokenIdx: number; hint_ko: string; law_ko: string }

const subjOf = (t: string) => SUBJECTS.find(s => s.token.toLowerCase() === t.toLowerCase())
const verbOf = (t: string) => VERBS.find(v => v.base === t.toLowerCase() || v.s3 === t.toLowerCase())
const objOf = (t: string) => OBJECTS.find(o => o.token.toLowerCase() === t.toLowerCase())
const advOf = (t: string) => ADVERBS.find(a => a.token.toLowerCase() === t.toLowerCase())

/** 블록 배열을 문장으로 검증. 반환: 실행 가능한 파스 or 깨진 블록 진단 (첫 번째 깨진 지점 1개) */
export function validate(tokens: string[]): ForgeVerdict {
  if (!tokens.length) return { kind: 'broken', brokenIdx: 0, hint_ko: '블록을 올려야 소환이 되지!', law_ko: '' }
  let i = 0
  // 1) 주어
  const first = tokens[0]
  if (!subjOf(first)) {
    if (verbOf(first)) {
      return { kind: 'broken', brokenIdx: 0, hint_ko: '누가 하는 거야? 영어는 주어부터!', law_ko: '헌법 제2조 — 주어는 절대 생략 금지' }
    }
    return { kind: 'broken', brokenIdx: 0, hint_ko: '문장의 시작은 주인공(주어) 블록!', law_ko: '헌법 제1조 — 주어가 먼저, 동사는 두 번째' }
  }
  const subject = subjOf(first)!
  i = 1
  // 2) 동사 (반드시 두 번째)
  if (i >= tokens.length) {
    return { kind: 'broken', brokenIdx: 0, hint_ko: '주인공이 뭘 하는지(동사)가 없어!', law_ko: '헌법 제1조 — 주어 다음은 동사' }
  }
  if (subjOf(tokens[i])) {
    return { kind: 'broken', brokenIdx: i, hint_ko: '주인공은 한 명이면 충분! 다음은 동사 차례야.', law_ko: '헌법 제1조 — 동사는 항상 두 번째' }
  }
  const verb = verbOf(tokens[i])
  if (!verb) {
    return { kind: 'broken', brokenIdx: i, hint_ko: '두 번째 자리엔 동사 블록이 와야 해!', law_ko: '헌법 제1조 — 동사는 항상 두 번째' }
  }
  // 3인칭 단수 왕관(-s) 일치 — 모든 소환 주어는 3인칭 단수
  if (tokens[i].toLowerCase() === verb.base) {
    return { kind: 'broken', brokenIdx: i, hint_ko: `${subject.token}는 VIP(3인칭 단수)! 동사에 왕관 -s를 씌워줘 → ${verb.s3}`, law_ko: 'C7 왕관 규칙 — he/she/it엔 동사+s' }
  }
  i += 1
  // 3) 목적어 (선택/필수)
  let object: ObjectDef | undefined
  if (i < tokens.length && objOf(tokens[i])) {
    if (!verb.needsObject && !verb.allowObject) {
      return { kind: 'broken', brokenIdx: i, hint_ko: `${verb.s3}는 혼자 하는 동작이라 뒤에 대상을 못 붙여!`, law_ko: '' }
    }
    object = objOf(tokens[i])
    i += 1
  }
  if (verb.needsObject && !object) {
    return { kind: 'broken', brokenIdx: Math.min(i, tokens.length - 1), hint_ko: `${verb.s3}는 누구를? 대상 블록이 필요해!`, law_ko: '' }
  }
  // 4) 부사 (선택, 맨 끝)
  let adverb: AdverbDef | undefined
  if (i < tokens.length && advOf(tokens[i])) {
    adverb = advOf(tokens[i])
    i += 1
  }
  // 5) 남는 블록 = 오류
  if (i < tokens.length) {
    return { kind: 'broken', brokenIdx: i, hint_ko: '이 블록은 여기 못 들어가! 순서를 다시 봐봐.', law_ko: '헌법 제1조 — 주어+동사(+대상)(+꾸밈) 순서' }
  }
  const sentence = tokens.join(' ') + '.'
  return { kind: 'ok', parse: { subject, verb, object, adverb }, sentence }
}

/** 정답 문장 비교용 정규화 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[.!]/g, '').replace(/\s+/g, ' ').trim()
}
