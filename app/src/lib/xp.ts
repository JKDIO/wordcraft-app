// XP 규칙 — CONTENT_SPEC §6 (콘텐츠·엔진 계약)
// v1.2.0 복습 개편: 복습 정답 5→10 (기본코스와 동급 가치 = 50:50 원칙),
// 하루 복습 정답 10장마다 콤보 보너스 +20. (v1.2.0 이전에는 복습 answer_events가
// 기록되지 않았으므로 관제실 파생 XP와 소급 불일치 없음 — CONTRACT §2 참조)
export const XP = {
  correct: 10,
  gameClear: 15,
  speak: 10,
  moduleClear: 50,
  bossClear: 100,
  reviewCorrect: 10,
  reviewCombo: 20,
  reviewComboEvery: 10,
  ghostClear: 50, // v1.3.0 유령 보스 최초 통과 보너스 (CONTRACT v1.3 §8)
  // v1.4.16 단어 대륙 (CONTRACT v1.5 §13) — 문항이 많으므로 문항당 XP는 모듈보다 낮게,
  // 대신 "팩을 끝내는 것"에 보상을 몰아 한 판을 완주하게 만든다.
  vocabCorrect: 5,
  vocabPack: 30,
  vocabPerfect: 15, // 90% 이상(★★★)일 때 추가
  // v1.4.20 단어 골렘 격파 (팩 5개마다 1회, 티어당 최대 4회 = 전체 40회)
  // 문항 12개(정답당 5) + 격파 보너스 40 → 한 판 100 안팎. 일반 모듈(50)보다 크고 팩(30)보다 크다.
  vocabGolem: 40,
} as const

/** ★XP 산식이 사는 곳은 세 군데다 (L12)★ — 여기(앱 부여) · AdminPage.xpOf/moduleBonus(관제실 파생) ·
 *  store.syncSharedDaily(기기 간 병합). 한 군데만 고치면 관제실 숫자가 조용히 부풀거나 쪼그라든다.
 *  v1.4.17에서 봉합한 어휘 XP 산식이 v1.4.18 소스 복구 때 통째로 유실돼 v1.4.19까지 배포됐다(L25·L27).
 *  그래서 아래 규칙을 **한 곳에** 두고 세 군데가 전부 이것만 부르게 했다. 새 module_id 규칙이 생기면 여기만 고친다. */
export function isVocabPackId(id: string): boolean { return /^V\d{1,2}-\d{2}$/.test(id) }
export function isVocabGolemId(id: string): boolean { return /^GOLEM-T\d{1,2}-\d$/.test(id) }
/** 진단 30 / 어휘 팩 30(+★★★ 15) / 단어 골렘 40 / 그 밖의 모듈 50 */
export function moduleBonusOf(moduleId: string, bestScore: number | null | undefined): number {
  if (moduleId.startsWith('DIAG-')) return 30
  if (isVocabPackId(moduleId)) return XP.vocabPack + ((bestScore ?? 0) >= 90 ? XP.vocabPerfect : 0)
  if (isVocabGolemId(moduleId)) return XP.vocabGolem
  return XP.moduleClear
}
/** 문항 1개의 XP — activity_type 기준. 세 곳이 전부 이 함수를 쓴다. */
export function answerXpOf(activityType: string, isCorrect: boolean): number {
  switch (activityType) {
    case 'diagnostic': return 0
    case 'game_match': return XP.gameClear
    case 'speak': return XP.speak
    case 'review': return isCorrect ? XP.reviewCorrect : 0
    case 'forge_discover': return 2
    case 'vocab': return isCorrect ? XP.vocabCorrect : 0
    default: return isCorrect ? XP.correct : 0
  }
}

/** 레벨업 필요 누적 XP = 300 × 현재 레벨 (누진) */
export function levelForXp(totalXp: number): number {
  let level = 1
  let need = 300
  let acc = totalXp
  while (acc >= need) {
    acc -= need
    level += 1
    need = 300 * level
  }
  return level
}

export function levelProgress(totalXp: number): { level: number; cur: number; need: number } {
  let level = 1
  let need = 300
  let acc = totalXp
  while (acc >= need) {
    acc -= need
    level += 1
    need = 300 * level
  }
  return { level, cur: acc, need }
}

export const LEVEL_TITLES = [
  '', '워드 탐험가', '사운드 마스터', '문장 건축가', '그래머 기사', '대화의 용사',
  '광산의 지배자', '언어 연금술사', '전설의 크래프터',
]
export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)] || '전설의 크래프터'
}
