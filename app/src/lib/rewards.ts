// v1.4.22 보상 로드맵 — 부모가 "XP 기준 + 보상 이름"을 직접 정한다.
//
// 왜 바꿨나 (v1.4.21까지): 보상이 코드에 박힌 1,000 XP 마일스톤이었다.
//   ① 부모가 무엇을 줄지 앱이 알 수 없어 아이 화면에 아무것도 보여줄 수 없었고
//   ② 아이 입장에서 "1,000 XP를 모으면 좋은 일이 생긴다"는 건 **내용이 없는 목표**다.
//   심리학적으로 목표는 구체적(specific)이고 근접(proximal)해야 힘을 낸다(Locke&Latham, Bandura 1981).
//   "치킨"이라고 적혀 있는 목표와 "1,000 XP"는 같은 목표가 아니다.
//
// ★규칙은 여기 한 곳에만 산다★ — 학습자 앱(RewardBoard·WorldMap)과 관제실(AdminPage)이
//   같은 함수를 부른다. XP·뱃지에서 복사본이 갈라져 사고가 났던 것과 같은 구조다(L27).

export interface RewardGoal {
  id: number
  learner_id?: string
  /** 이 XP에 도달하면 달성 */
  threshold_xp: number
  /** 부모가 적은 보상 이름 (예: '치킨 파티') */
  title: string
  emoji: string
  note: string | null
  /** 부모가 실제로 보상을 준 시각. null = 아직 안 줌 */
  granted_at: string | null
  created_at?: string
}

export interface RewardStep {
  goal: RewardGoal
  /** totalXp가 기준선을 넘었다 */
  reached: boolean
  /** 부모가 지급 처리했다 */
  granted: boolean
  /** 남은 XP (도달했으면 0) */
  remaining: number
  /** 직전 목표 → 이 목표 구간의 진행률 0~100 */
  pct: number
  /** 구간 시작 XP (직전 목표의 기준선, 없으면 0) */
  from: number
  /** 구간 전체 폭 */
  span: number
}

export interface RewardView {
  steps: RewardStep[]
  /** 아직 도달하지 못한 첫 목표 = "다음 보상" */
  next: RewardStep | null
  reachedCount: number
  /** 도달했는데 아직 지급 안 된 것 (아이 화면에 '아빠한테 보여주기!'로 뜬다) */
  pending: RewardStep[]
}

/** 한 아이가 가질 수 있는 보상 목표 수 상한 — 너무 많으면 사다리가 벽처럼 보인다 */
export const MAX_GOALS = 12
export const REWARD_EMOJIS = ['🎁', '🍗', '🍕', '🍦', '🎮', '🎬', '🧱', '⚽', '🎧', '🚲', '📚', '🏕️', '🎨', '💰', '🏆']

/** 부모가 입력한 값 검증 — 관제실과 (혹시 생길) 다른 입력 경로가 같은 규칙을 쓰도록 여기에 둔다. */
export function validateGoal(thresholdXp: number, title: string, existing: RewardGoal[], editingId?: number): string | null {
  if (!Number.isFinite(thresholdXp) || Math.floor(thresholdXp) !== thresholdXp) return 'XP 기준은 정수로 적어주세요.'
  if (thresholdXp < 1) return 'XP 기준은 1 이상이어야 해요.'
  if (thresholdXp > 10_000_000) return 'XP 기준이 너무 큽니다.'
  const t = title.trim()
  if (!t) return '보상 이름을 적어주세요.'
  if (t.length > 60) return '보상 이름은 60자 이내로 적어주세요.'
  if (existing.some(g => g.threshold_xp === thresholdXp && g.id !== editingId)) return '같은 XP 기준의 보상이 이미 있어요.'
  if (existing.filter(g => g.id !== editingId).length >= MAX_GOALS) return `보상은 최대 ${MAX_GOALS}개까지 등록할 수 있어요.`
  return null
}

/** 보상 사다리 계산 — 양쪽 앱의 단일 진실 */
export function buildRewardView(goals: RewardGoal[], totalXp: number): RewardView {
  const sorted = [...goals].sort((a, b) => a.threshold_xp - b.threshold_xp)
  const steps: RewardStep[] = []
  let prev = 0
  for (const g of sorted) {
    const span = Math.max(1, g.threshold_xp - prev)
    const done = Math.max(0, Math.min(span, totalXp - prev))
    const reached = totalXp >= g.threshold_xp
    steps.push({
      goal: g,
      reached,
      granted: !!g.granted_at,
      remaining: reached ? 0 : g.threshold_xp - totalXp,
      pct: Math.round((done / span) * 100),
      from: prev,
      span,
    })
    prev = g.threshold_xp
  }
  const next = steps.find(s => !s.reached) ?? null
  return {
    steps,
    next,
    reachedCount: steps.filter(s => s.reached).length,
    pending: steps.filter(s => s.reached && !s.granted),
  }
}

/** 남은 XP를 최근 하루 평균 XP로 나눈 도착 예상일.
 *  "언제 도착하는지"가 보이면 목표는 훨씬 세게 당긴다(goal-gradient effect, Kivetz 2006).
 *  표본이 부족하거나(3일 미만) 평균이 0이면 null — 거짓 약속을 하지 않는다. */
export function etaDays(remaining: number, xpPerDay: number, sampleDays: number): number | null {
  if (remaining <= 0) return 0
  if (sampleDays < 3 || xpPerDay <= 0) return null
  const d = Math.ceil(remaining / xpPerDay)
  return d > 999 ? null : d
}

/** xp_events 행들에서 "최근 N일 중 학습한 날의 하루 평균 XP"를 낸다.
 *  안 한 날을 0으로 세면 평균이 꺼져 예상일이 비현실적으로 늘어난다 → 학습한 날만 센다. */
export function dailyXpAverage(rows: { amount: number; created_at: string }[], days = 14): { avg: number; sampleDays: number } {
  const byDay = new Map<string, number>()
  const cutoff = Date.now() - days * 86400_000
  for (const r of rows) {
    const t = new Date(r.created_at).getTime()
    if (!Number.isFinite(t) || t < cutoff) continue
    const key = new Date(t).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
    byDay.set(key, (byDay.get(key) || 0) + (Number(r.amount) || 0))
  }
  const vals = [...byDay.values()].filter(v => v > 0)
  if (!vals.length) return { avg: 0, sampleDays: 0 }
  return { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), sampleDays: vals.length }
}
