// ── v1.4.19 워드몬 (단어 = 잡아서 키우는 몹) ─────────────────────────────
//
// 왜 만들었나 (Dio님 지적, 2026-08-13): "단어 대륙 구성이 좀 진부하게 느껴진다."
// 실측해보니 한 팩 24문항 중 20문항(83%)이 '4개 중 하나 탭하기'로 동일했고,
// 라이트너 복습 박스 1~5는 화면에 **숫자로만** 존재했다. 복습이 '숙제'로 보였다.
//
// 해결의 핵심: **스키마를 하나도 바꾸지 않고**, 이미 있는 review_cards.box(1~5)를
// '진화 단계'로 다시 읽는다. 맞히면 진화하고 틀리면 알로 돌아간다 — 라이트너 규칙 그대로다.
// 아이 입장에서 복습은 그 순간 "외우기"가 아니라 **"키우기"** 가 된다.
// 예한이는 마인크래프트·로블록스를 한다. 스폰 알에서 몹이 자라는 감각을 이미 안다.
//
// ⚠️ L17(무손실): 새 테이블·새 컬럼 0. box 값의 **의미도 바꾸지 않는다**(간격 반복 주기 동일).
//    바뀌는 것은 오직 '보여주는 방식'이다.

export interface EvoStage {
  stage: number
  emoji: string
  name: string
  /** app.css의 라이트너 층 색 토큰 재사용 — 디자인 일관성(흙→돌→청금석→금→다이아) */
  color: string
  /** 다음 진화까지 며칠 뒤 다시 만나는지 (BOX_INTERVALS와 1:1) */
  days: number
}

export const EVO_STAGES: EvoStage[] = [
  { stage: 1, emoji: '🥚', name: '알',     color: 'var(--dirt)',      days: 0 },
  { stage: 2, emoji: '🐣', name: '아기',   color: 'var(--wc-stone)',  days: 2 },
  { stage: 3, emoji: '🦖', name: '성체',   color: 'var(--info)',      days: 4 },
  { stage: 4, emoji: '⚡', name: '각성',   color: 'var(--gold)',      days: 7 },
  { stage: 5, emoji: '👑', name: '전설',   color: 'var(--diamond)',   days: 14 },
]

export function evoOf(box: number): EvoStage {
  const b = Math.min(Math.max(Math.round(box || 1), 1), 5)
  return EVO_STAGES[b - 1]
}

/** 진화 연출용 문구 — 능력이 아니라 **전략과 노력**을 칭찬한다(성장 마인드셋, 블루프린트 원리 17). */
export function evoMessage(from: number, to: number): string {
  if (to > from) {
    const e = evoOf(to)
    if (to === 5) return `${e.emoji} 전설 등극! 끝까지 붙잡고 늘어진 결과야 👑`
    return `${e.emoji} ${e.name}(으)로 진화! 계속 만나준 게 통했어`
  }
  // 되돌아감 — 절대 처벌로 읽히지 않게. 오답은 리스폰이다(콘텐츠 헌법 3).
  return '🥚 알로 리스폰! 다시 키우면 돼 — 여기서 만난 게 이득이야'
}

/** 도감 진열용 요약 */
export interface DexEntry {
  cardId: string
  word: string
  meaning: string
  box: number
  reviewCount: number
}

/** 단어 대륙에서 잡은 몹만 골라낸다 (card_id = 'vocab:<단어>') */
export const VOCAB_CARD_PREFIX = 'vocab:'
export function isVocabCard(cardId: string): boolean {
  return cardId.startsWith(VOCAB_CARD_PREFIX)
}

/** 도감 통계 — 잡은 수 / 단계별 분포 / 전설 수 */
export interface DexStats {
  caught: number
  byStage: number[]   // index 0..4 = stage 1..5
  legend: number
}
export function dexStats(entries: DexEntry[]): DexStats {
  const byStage = [0, 0, 0, 0, 0]
  for (const e of entries) byStage[evoOf(e.box).stage - 1]++
  return { caught: entries.length, byStage, legend: byStage[4] }
}
