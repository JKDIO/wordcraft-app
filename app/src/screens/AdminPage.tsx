import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, fetchLearner, type Learner } from '../lib/supabase'
import { MODULE_ORDER, WORLDS, RUNE_MODULES, EXT_MODULE_ORDER, EXT_WORLDS } from '../lib/content'
// v1.4.35 — 아빠 화면에 뜨는 숫자의 단일 원천. 규칙을 이 파일에 복사하지 않는다(L27).
import {
  studyTimeOfDay, accuracyOf, progressView, reviewDebtOf, xpAudit, integrityCheck, coachTips, isAssessed, kstDayOf,
  // v1.4.40 — 기기 분리 · 집중시간 산식 · '신규 학습만' 판정을 화면이 다시 구현하지 않는다(L27·L51).
  excludedSessionIds, learnerEvents, learnerSessions, focusSecOfTimestamps, isNewLearning,
  GOAL_SEC as GOAL_SEC_M, type StudyTime, type AccuracySplit, type ReviewDebt, type ProgressView,
  type XpAudit, type IntegrityIssue, type CoachTip, type MetricEvent, type MetricSession, type MetricProgress,
} from '../lib/adminMetrics'
import { TodayBriefing, IntegrityPanel } from './AdminHealth'
import { loadVocab, AWAKEN_ICON, type VocabData } from '../lib/vocab'
import { EVO_STAGES } from '../lib/wordmon'
import { XP, levelProgress, levelTitle, answerXpOf, moduleBonusOf, isVocabGolemId } from '../lib/xp'
import { BADGE_DEFS, BADGE_GROUPS, GROUP_EMOJI, earnedFrom, VOCAB_PACK_RE, GOLEM_RE, type BadgeFacts } from '../lib/badges'
import { buildRewardView, validateGoal, MAX_GOALS, REWARD_EMOJIS, type RewardGoal } from '../lib/rewards'
import { DAILY_REVIEW_CAPACITY } from '../lib/adminMetrics'
import { APP_VERSION, isNewer, type VersionInfo } from '../lib/version'

/* ─────────────────────────────────────────────
   아빠 전용 관제실 v2 — 심층 학습관리 대시보드 (모바일 우선)
   - PIN 게이트 → 탭 메뉴(개요/활동/복습/분석/진행/보상)
   - 집계는 answer_events·module_progress 기반(앱 동기화 상태와 무관하게 정확)
   - XP는 앱 실제 규칙(StepRunner)과 동일 산식 → 오늘 XP와 누적 XP가 같은 날 일치
──────────────────────────────────────────────*/

interface AnswerEvent {
  id: number; module_id: string; activity_type: string; question_id: string
  question_text: string | null; given_answer: string | null; correct_answer: string | null
  is_correct: boolean; response_ms: number | null; created_at: string
  /** v1.4.40 — 어느 기기에서 나온 문항인지 알려면 필요하다(answer_events에는 device 컬럼이 없다). */
  session_id: number | null
}
interface ModProgress { module_id: string; status: string; best_score: number | null; attempts: number; total_time_seconds: number; first_started_at: string | null; completed_at: string | null; updated_at: string; stars?: number | null; mastered_at?: string | null }
interface Session { id: number; started_at: string; ended_at: string | null; duration_seconds: number | null; device: string | null }
interface ReviewCard { card_id: string; card_front: string | null; box: number; due_date: string | null; last_result: boolean | null; review_count: number; updated_at: string }
interface BadgeRow { id: number; badge_id: string; earned_at: string }
interface RewardRow { id: number; learner_id: string; milestone_xp: number; note: string | null; granted_at: string }

type Tab = 'overview' | 'activity' | 'review' | 'analysis' | 'progress' | 'rewards'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: '개요' },
  { id: 'activity', icon: '🗓️', label: '활동' },
  { id: 'review', icon: '⛏️', label: '복습' },
  { id: 'analysis', icon: '🔬', label: '분석' },
  { id: 'progress', icon: '🗺️', label: '진행' },
  { id: 'rewards', icon: '🎁', label: '보상' },
]

/** 모듈 한글 별명 (v1.2.0: 신규 8모듈 / v1.3.0: 수정 동굴 R0~R9 + 리스닝 아케이드) */
const MODULE_NAMES: Record<string, string> = {
  A1: '알파벳 두 얼굴', A2: '모음 5형제', A3: '소리 합치기', A4: '마법의 e',
  R0: '동굴 발견', R1: '단모음 룬', R2: '긴 모음 룬', R3: '미끄럼틀 룬', R4: '익숙한 룬',
  R5: '불의 룬', R6: '쌍둥이 룬', R7: '강세 룬', R8: '룬 조합 훈련', R9: '소리를 여는 자',
  C0: '영어나라 헌법', C5: '대명사 변신', C6: 'be동사 삼형제', C7: '일반동사 부대',
  B21a: '동사 사냥터 1', B21b: '동사 사냥터 2', B22a: '동사 사냥터 3', B22b: '동사 사냥터 4',
  D1S: '생존 캠프', D2S: '미국 상륙 작전', D3S: '미국 친구 사귀기',
  T1: '과거로 GO!', T2: '미래로 GO!', T3: '지금 이 순간',
  ECHO: '에코 사냥(듣기)', CMD: '지령 미션(듣기)', FORGE: '문장 소환진',
  // v1.4.23 월드 7~10 (승인 전 = 아이 화면 미노출. 관제실 라벨은 미리 넣어 둔다 — L28 ③)
  P1: '그림자 문장', P2: '뒤에서 꾸미는 자들', P3: '대명사 미로', P4: '신호등 마을', P5: '요지 사냥', P6: '순서의 탑',
  W1: '반대의 망치', W2: '다시·너머의 망치', W3: '변신 모루', W4: '라틴 유적', W5: '그리스 유적', W6: '파티클 마법서',
  S1: '표현 인벤토리', S2: '리듬 대장간', S3: '연음 다리', S4: '타임어택 아레나', S5: '역할극 던전', S6: '거울 방',
  G1: '합체 공방 I', G2: '합체 공방 II', G3: '문단 조립 라인', G4: '모방 개조 공방', G5: '서술형 시뮬레이터', G6: '잉크의 우체통',
}

/** v1.4.21 — '학습 모듈'인가? (진단·어휘 팩·단어 골렘 제외)
 *  module_progress·answer_events에는 세 종류가 섞여 들어오므로, 모듈 지표는 반드시 이걸로 거른다. */
export function isLearnModuleId(id: string): boolean {
  return !id.startsWith('DIAG-') && !VOCAB_PACK_RE.test(id) && !GOLEM_RE.test(id)
}

/** v1.4.16 — 모듈 표시 이름. 단어 대륙 팩(200개)·골렘(40개)은 표에 넣지 않고 규칙으로 만든다. */
function moduleName(id: string): string {
  const v = /^V(\d{1,2})-(\d{2})$/.exec(id)
  if (v) return `🗺️ 단어 대륙 T${v[1]}-${Number(v[2])}구역`
  const g = /^GOLEM-T(\d{1,2})-(\d)$/.exec(id)
  if (g) return `⚔️ 단어 골렘 T${g[1]} #${g[2]}`
  return MODULE_NAMES[id] || id
}

/** 라이트너 박스 층 색 (흙→돌→청금석→금→다이아) */
const BOX_COLORS = ['var(--dirt)', 'var(--wc-stone)', 'var(--info)', 'var(--gold)', 'var(--diamond)']
const BOX_LABELS = ['박스1 (오늘)', '박스2 (2일)', '박스3 (4일)', '박스4 (7일)', '박스5 (14일)']

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']
/** ★L27★ 출석 기준을 여기에 복사하지 않는다 — adminMetrics 한 곳만 본다. */
const GOAL_SEC = GOAL_SEC_M
const DIAG_DONE_XP = 30 // App.tsx onDiagComplete 보너스와 동일

/* ── v1.4.35 조회 상한 (L31: 모든 조회에 상한·정렬. 그리고 상한에 닿으면 화면이 그 사실을 말한다) ──
   상한에 조용히 잘리면 정답률·취약 영역·누적 XP가 전부 과소 집계된다. 그래서 숫자를 올리는 것으로
   끝내지 않고, `rows.length === LIMIT`이면 정합성 진단이 P0으로 띄운다. */
export const EVENT_LIMIT = 12000
/** ★v1.4.40★ 400 → 20,000.
 *  v1.4.40부터 **기기 분리(desktop 제외)가 이 목록에 의존한다.** 세션이 400건을 넘겨 잘리면
 *  그보다 오래된 아빠 PC 문항을 걸러낼 수 없어 아이 지표로 되돌아온다(독립 감사 지적).
 *  세션 행은 6개 컬럼짜리라 2만 행이어도 가볍다. */
export const SESSION_LIMIT = 20000
export const CARD_LIMIT = 20000
export const PROGRESS_LIMIT = 5000

/** 향후 확장 월드 로드맵 — 중학 대비 심화 과정 (콘텐츠 추가 시 열림)
 *  월드 5(시제 시간여행)는 v1.2.0에서 정식 오픈 → 로드맵에서 졸업 */
/** 월드 6(문장 소환진 공방)은 v1.4.0에서 오픈했다가 **v1.4.24에서 해체**했다 —
 *  독립 화면으로 두면 커리큘럼이 늘 때마다 길어져 방치되므로, 문법 단원 안의 '🔮 문장 소환' 스텝으로 녹였다.
 *  기존 기록(activity_type 'forge'/'forge_discover', module_id 'FORGE')은 그대로 보존한다(L17). */
/** v1.4.23 — 월드 7~10은 **제작이 끝났고 배포도 됐다.** 다만 Dio님 승인 전까지 아이 화면에 뜨지 않는다.
 *  여는 방법: 서버 `version.json`의 `worlds_ready`를 true로 (앱 재배포 불필요). */
const FUTURE_WORLDS: { world: number; emoji: string; name: string; desc: string }[] = [
  { world: 7, emoji: '📖', name: '독해 던전', desc: '청킹 읽기 · 후치수식 · 대명사 추적 · 담화 표지 · 요지 · 순서 배열 (6단원)' },
  { world: 8, emoji: '🔨', name: '어휘 대장간', desc: '접두사 · 접미사 · 라틴/그리스 어근 · 구동사 파티클 (6단원)' },
  { world: 9, emoji: '💬', name: '회화 아레나', desc: '덩어리 표현 · 강세 리듬 · 연음 · 4/3/2 타임어택 · 역할극 (6단원)' },
  { world: 10, emoji: '✍️', name: '서술 마스터리', desc: '문장 결합 · 문단 구조 · 모방 개조 · 조건 영작 (6단원)' },
]

/** 앱 실제 XP 규칙(StepRunner·ReviewMine emit)과 동일 산식 (CONTRACT §2)
 *  복습 10 XP는 v1.2.0부터 — 그 전엔 복습 answer_events 자체가 없었으므로 소급 불일치 없음 */
// ★L12·L27★ 산식을 여기에 복사하지 않는다. xp.ts의 단일 정의만 부른다.
//   (v1.4.17에 여기 복사해 뒀던 어휘 산식이 v1.4.18 소스 복구 때 유실돼 관제실이 51% 부풀었다.)
function xpOf(e: AnswerEvent): number { return answerXpOf(e.activity_type, e.is_correct) }
/** 복습 콤보 보너스 — 하루 복습 정답 10장마다 +20 (ReviewMine과 동일 산식) */
function comboBonusOf(reviewCorrectInDay: number): number {
  return Math.floor(reviewCorrectInDay / XP.reviewComboEvery) * XP.reviewCombo
}
function moduleBonus(p: ModProgress): number { return moduleBonusOf(p.module_id, p.best_score) }
/** v1.3.0 유령 보스 최초 통과 보너스 (CONTRACT v1.3 §8) — 앱 recordXp(reason='ghost_boss')와 1:1, mastered_at 귀속 */
function ghostBonus(p: ModProgress): number {
  return p.mastered_at ? XP.ghostClear : 0 // 50
}

/** KST 날짜 키 'YYYY-MM-DD' — ★v1.4.39★ 규칙·구현 모두 adminMetrics 한 곳만 쓴다(성능 사고 재발 방지) */
const kstDate = kstDayOf
/** KST 시:분:초 */
function kstClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function dateLabel(key: string, todayKey: string, yKey: string): string {
  if (key === todayKey) return '오늘'
  if (key === yKey) return '어제'
  const d = new Date(`${key}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW_KO[d.getUTCDay()]})`
}
function fmtMin(sec: number): string {
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

export function AdminPage(props: { learner?: Learner; onExit?: () => void } = {}) {
  const [pinOk, setPinOk] = useState(() => sessionStorage.getItem('wc_admin') === '1')
  // 보호자 대시보드에서 아이를 골라 들어온 경우(learner 전달) → 이미 구글 인증됨, PIN 생략
  if (props.learner) return <Dashboard learner={props.learner} onExit={props.onExit} />
  return pinOk ? <Dashboard /> : <PinGate onOk={() => { sessionStorage.setItem('wc_admin', '1'); setPinOk(true) }} />
}

function PinGate(props: { onOk: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const [serverPin, setServerPin] = useState<string | null>(null)
  useEffect(() => { fetchLearner().then(l => setServerPin(l.admin_pin)).catch(() => setServerPin('7351')) }, [])
  function tryPin(p: string) {
    if (serverPin && p === serverPin) props.onOk()
    else { setErr(true); setPin(''); setTimeout(() => setErr(false), 1200) }
  }
  return (
    <div className="center-box admin-pin">
      <div className="diag-big">👨‍👦</div>
      <h2>아빠 전용 관제실</h2>
      <p>PIN 4자리를 입력하세요</p>
      <div className={`pin-dots ${err ? 'shake' : ''}`}>{[0, 1, 2, 3].map(i => <span key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />)}</div>
      {err && <p className="pin-err">PIN이 달라요</p>}
      <div className="pin-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k, i) => (
          <button key={i} className="pin-key" disabled={k === ''} onClick={() => {
            if (k === '⌫') setPin(pin.slice(0, -1))
            else if (pin.length < 4) {
              const np = pin + String(k)
              setPin(np)
              if (np.length === 4) tryPin(np)
            }
          }}>{k}</button>
        ))}
      </div>
    </div>
  )
}

function Dashboard(props: { learner?: Learner; onExit?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [learner, setLearner] = useState<Learner | null>(props.learner ?? null)
  const [events, setEvents] = useState<AnswerEvent[]>([])
  const [progress, setProgress] = useState<ModProgress[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [cards, setCards] = useState<ReviewCard[]>([])
  const [badges, setBadges] = useState<BadgeRow[]>([])
  const [rewards, setRewards] = useState<RewardRow[]>([])
  const [goals, setGoals] = useState<RewardGoal[]>([])
  /** v1.4.40 — XP 지급 원장 합계. learners.xp와 벌어지면 지급 기록이 유실됐다는 신호다. */
  const [xpEventsSum, setXpEventsSum] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [granting, setGranting] = useState<number | null>(null)
  const [latest, setLatest] = useState<VersionInfo | null>(null)
  /** v1.4.35 — 어떤 조회가 실패했는가. 예전에는 catch로 통째로 삼키고 **낡은 숫자를 최신인 척** 보여 줬다. */
  const [failedTables, setFailedTables] = useState<string[]>([])
  /** v1.4.35 — 조회가 상한에 닿았는가(=조용히 잘렸는가) */
  const [caps, setCaps] = useState<{ events: boolean; sessions: boolean }>({ events: false, sessions: false })
  const timerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    // 새 버전 감지 (v1.2.1) — 관제실 탭은 오래 열려 있으므로, 배포되면 배너로 새로고침 유도
    // ★v1.4.35★ worlds_ready도 여기서 온다 — 관제실 진도 분모를 **아이 화면과 같게** 맞추기 위해.
    fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(v => v && setLatest(v as VersionInfo)).catch(() => {})
    const failed: string[] = []
    try {
      const l = props.learner ?? await fetchLearner()
      setLearner(l)
      // 최근 120일 — 캘린더/추이/분석 공용. KST 기준 시작일.
      const d = new Date(); d.setDate(d.getDate() - 119)
      const sinceIso = encodeURIComponent(`${d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })}T00:00:00+09:00`)
      /** 한 테이블이 실패해도 나머지는 살린다. 실패한 것은 **이름을 남겨 화면에 띄운다**(무음 실패 금지).
       *  ★v1.4.38★ `db.select`가 아니라 `db.selectAll`을 쓴다 — 서버가 1,000행에서 잘라 버리기 때문이다.
       *  (배포 직후 정합성 진단이 "XP 255% 차이"로 잡아낸 결함. 자세한 경위는 supabase.ts 주석 참조.) */
      const cut: Record<string, boolean> = {}
      const get = async (label: string, table: string, query: string, maxRows: number): Promise<unknown[]> => {
        try {
          const r = await db.selectAll(table, query, maxRows)
          cut[label] = r.truncated
          return r.rows
        } catch { failed.push(label); return [] }
      }
      const [ev, pr, se, rc, bd, rw, rg, xe] = await Promise.all([
        get('활동 기록', 'answer_events', `learner_id=eq.${l.id}&created_at=gte.${sinceIso}&order=created_at.desc`, EVENT_LIMIT),
        get('모듈 진도', 'module_progress', `learner_id=eq.${l.id}&order=module_id.asc`, PROGRESS_LIMIT),
        get('세션', 'sessions', `learner_id=eq.${l.id}&order=started_at.desc`, SESSION_LIMIT),
        get('복습 카드', 'review_cards', `learner_id=eq.${l.id}&order=box.desc,id.asc`, CARD_LIMIT),
        get('뱃지', 'badges', `learner_id=eq.${l.id}&order=earned_at.desc`, 2000),
        get('지급 이력', 'parent_rewards', `learner_id=eq.${l.id}&order=granted_at.desc`, 2000),
        get('보상 목표', 'reward_goals', `learner_id=eq.${l.id}&order=threshold_xp.asc`, 200),
        // v1.4.40 — XP 지급 원장. 저장값과 벌어지면 '기록이 유실됐다'는 신호다(진단 패널 xp_ledger_gap).
        // v1.4.40-b — 날짜 창을 준다(무한 성장 방지). 다른 조회와 같은 120일.
        get('XP 기록', 'xp_events', `learner_id=eq.${l.id}&created_at=gte.${sinceIso}&select=amount&order=created_at.desc`, 50000),
      ])
      // 실패한 조회는 빈 배열이 온다 — 그걸 그대로 반영하면 "기록이 사라진 것처럼" 보인다.
      // 그래서 **실패한 테이블만 이전 값을 유지**하고, 화면에는 실패 사실을 띄운다.
      if (!failed.includes('활동 기록')) setEvents(ev as unknown as AnswerEvent[])
      if (!failed.includes('모듈 진도')) setProgress(pr as unknown as ModProgress[])
      if (!failed.includes('세션')) setSessions(se as unknown as Session[])
      if (!failed.includes('복습 카드')) setCards(rc as unknown as ReviewCard[])
      if (!failed.includes('뱃지')) setBadges(bd as unknown as BadgeRow[])
      if (!failed.includes('지급 이력')) setRewards(rw as unknown as RewardRow[])
      if (!failed.includes('보상 목표')) setGoals(rg as unknown as RewardGoal[])
      if (!failed.includes('XP 기록')) setXpEventsSum((xe as { amount: number }[]).reduce((a, x) => a + (x.amount || 0), 0))
      // ★v1.4.38★ "받은 행 수 == 내 limit"으로 포화를 판정하면, 서버 상한이 내 상한보다 작을 때
      //   그 검사는 **영원히 통과한다.** 이제 페이지네이터가 "더 있는데 못 받았다"를 직접 알려준다.
      // v1.4.40-b — XP 기록이 잘리면 xp_ledger_gap이 거짓 경고를 낸다. 잘렸으면 감사 자체를 끈다.
      setCaps({ events: !!cut['활동 기록'], sessions: !!cut['세션'] })
      if (cut['XP 기록']) setXpEventsSum(null)
      // v1.4.40 — 예전엔 7개 중 6개가 실패해도 "지금 기준" 시각을 갱신해 최신인 척했다.
      //   실패가 하나라도 있으면 시각을 갱신하지 않는다(P0 배너와 헤더가 서로 다른 말을 하지 않도록).
      if (failed.length === 0) setUpdatedAt(new Date())
    } catch { failed.push('아이 정보') /* 오프라인 — 기존 데이터 유지 */ }
    setFailedTables(failed)
    setLoading(false)
  }, [props.learner])

  useEffect(() => {
    void refresh()
    // v1.4.35 — 숨은 탭에서는 폴링하지 않는다. 관제실은 하루 종일 열려 있는 화면이라
    //   25초마다 7개 테이블을 계속 긁으면 아빠 폰 배터리와 Supabase 쿼터를 그냥 태운다.
    //   (돌아오면 visibilitychange가 즉시 한 번 갱신한다.)
    timerRef.current = window.setInterval(() => { if (!document.hidden) void refresh() }, 25000)
    const onVis = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { if (timerRef.current) clearInterval(timerRef.current); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  /* ── v1.4.22 보상 로드맵 CRUD ────────────────────────────────
     v1.4.21까지는 1,000 XP마다 자동 생성되는 마일스톤이었다. 아빠가 무엇을 줄지 앱이 몰라
     아이 화면에는 아무것도 띄울 수 없었다. 이제 기준 XP와 보상 이름을 아빠가 직접 정한다.
     지급하면 ① reward_goals.granted_at 기록 ② parent_rewards에 이력 1행(기존 테이블 의미 그대로 — L17). */
  const addGoal = useCallback(async (thresholdXp: number, title: string, emoji: string, note: string) => {
    const lid = learner?.id
    if (!lid) return '아이 정보를 불러오지 못했어요.'
    const err = validateGoal(thresholdXp, title, goals)
    if (err) return err
    try {
      const rows = await db.insert('reward_goals', {
        learner_id: lid, threshold_xp: thresholdXp, title: title.trim(), emoji, note: note.trim() || null,
      })
      const row = (rows as unknown as RewardGoal[])[0]
      if (row) setGoals(prev => [...prev, row].sort((a, b) => a.threshold_xp - b.threshold_xp))
      return null
    } catch (e) { return `저장하지 못했어요 (${String(e).slice(0, 80)})` }
  }, [learner?.id, goals])

  const editGoal = useCallback(async (id: number, thresholdXp: number, title: string, emoji: string, note: string) => {
    const err = validateGoal(thresholdXp, title, goals, id)
    if (err) return err
    try {
      await db.update('reward_goals', `id=eq.${id}`, {
        threshold_xp: thresholdXp, title: title.trim(), emoji, note: note.trim() || null, updated_at: new Date().toISOString(),
      })
      setGoals(prev => prev.map(g => (g.id === id ? { ...g, threshold_xp: thresholdXp, title: title.trim(), emoji, note: note.trim() || null } : g))
        .sort((a, b) => a.threshold_xp - b.threshold_xp))
      return null
    } catch (e) { return `저장하지 못했어요 (${String(e).slice(0, 80)})` }
  }, [goals])

  const removeGoal = useCallback(async (id: number) => {
    try {
      await db.del('reward_goals', `id=eq.${id}`)
      setGoals(prev => prev.filter(g => g.id !== id))
    } catch { /* 재시도 가능 */ }
  }, [])

  const grantGoal = useCallback(async (g: RewardGoal) => {
    const lid = learner?.id
    if (!lid) return
    setGranting(g.id)
    const at = new Date().toISOString()
    try {
      await db.update('reward_goals', `id=eq.${g.id}`, { granted_at: at, updated_at: at })
      setGoals(prev => prev.map(x => (x.id === g.id ? { ...x, granted_at: at } : x)))
      // 지급 이력은 기존 parent_rewards에 그대로 남긴다(목표를 나중에 고치거나 지워도 이력은 보존).
      try {
        const rows = await db.insert('parent_rewards', { learner_id: lid, milestone_xp: g.threshold_xp, note: `${g.emoji} ${g.title}` })
        const row = (rows as unknown as RewardRow[])[0]
        if (row) setRewards(prev => [row, ...prev])
      } catch { /* 이력 실패는 지급 자체를 막지 않는다 */ }
    } catch { /* 재시도 가능 */ }
    setGranting(null)
  }, [learner?.id])

  const ungrantGoal = useCallback(async (g: RewardGoal) => {
    try {
      await db.update('reward_goals', `id=eq.${g.id}`, { granted_at: null, updated_at: new Date().toISOString() })
      setGoals(prev => prev.map(x => (x.id === g.id ? { ...x, granted_at: null } : x)))
    } catch { /* */ }
  }, [])

  // ── 날짜 키 ──
  const todayKey = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  const yKey = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }) }, [])
  const weekStart = useMemo(() => {
    const d = new Date(`${todayKey}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
  }, [todayKey])

  // ★v1.4.35★ worlds_ready = 아이 화면에 월드 7~10이 열려 있는가. 이걸 안 보면 관제실 분모가 28로 굳어
  //   "전체 진행률 100%"라는 거짓말이 나온다(실제로 나오고 있었다 — 아이 앱은 28/52였다).
  const worldsReady = !!latest?.worlds_ready
  const M = useMemo(
    () => computeMetrics(events, progress, sessions, cards, badges, learner, todayKey, yKey, weekStart,
      worldsReady, { events: caps.events, sessions: caps.sessions }, failedTables, xpEventsSum),
    [events, progress, sessions, cards, badges, learner, todayKey, yKey, weekStart, worldsReady, caps.events, caps.sessions, failedTables, xpEventsSum],
  )

  const lp = levelProgress(learner?.xp ?? 0)

  return (
    <div className="admin">
      <header className="admin-head">
        {props.onExit && (
          <button className="refresh-btn" onClick={props.onExit} aria-label="가족 목록으로">←</button>
        )}
        <h1>👨‍👦 {props.learner ? `${learner?.nickname ?? props.learner.nickname} 관제실` : '예한이 관제실'}</h1>
        <button className="refresh-btn" onClick={() => void refresh()} disabled={loading}>
          {loading ? '갱신 중…' : '🔄'}
        </button>
      </header>
      <p className="admin-updated">{updatedAt ? `${updatedAt.toLocaleTimeString('ko-KR')} 기준 · 25초 자동 갱신 · v${APP_VERSION}` : '불러오는 중…'}</p>

      {latest && isNewer(latest.version, APP_VERSION) && (
        <button className="adm-update" onClick={() => location.reload()}>
          🔄 새 버전 v{latest.version} 도착! <b>여기를 눌러 업데이트</b>{latest.notes ? <span className="adm-update-notes"> — {latest.notes}</span> : null}
        </button>
      )}

      <nav className="adm-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`adm-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <span className="adm-tab-i">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <OverviewTab M={M} lp={lp} learner={learner} onSeeAll={() => setViewerOpen(true)}
          onBackfilled={ids => setBadges(prev => [
            ...ids.filter(id => !prev.some(b => b.badge_id === id))
              .map((id, i) => ({ id: -1 - i, badge_id: id, earned_at: new Date().toISOString() })),
            ...prev,
          ])} />
      )}
      {tab === 'activity' && <ActivityTab events={events} todayKey={todayKey} yKey={yKey} dayAgg={M.dayAgg} onSeeAll={() => setViewerOpen(true)} />}
      {tab === 'review' && <ReviewTab M={M} cards={cards} />}
      {tab === 'analysis' && <AnalysisTab M={M} />}
      {tab === 'progress' && <ProgressTab M={M} />}
      {tab === 'rewards' && <RewardsTab M={M} lp={lp} rewards={rewards} badges={badges} goals={goals} granting={granting}
        onAdd={addGoal} onEdit={editGoal} onRemove={removeGoal} onGrant={grantGoal} onUngrant={ungrantGoal} />}

      <p className="admin-foot">WordCraft 관제실 v3 · 문항 단위 기록 기반 심층 분석 · 숫자는 매 갱신마다 자가 점검됩니다</p>

      {viewerOpen && learner && (
        <ProblemViewer learnerId={learner.id} baseEvents={events} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  )
}

/* ═══════════════ 집계 엔진 ═══════════════ */
interface Metrics {
  todayEvents: AnswerEvent[]
  /** ★v1.4.35★ 진실 계층 — 규칙은 lib/adminMetrics.ts 한 곳에만 있다 */
  time: StudyTime
  accToday: AccuracySplit; acc7: AccuracySplit
  prog: ProgressView
  debt: ReviewDebt
  xpChk: XpAudit
  issues: IntegrityIssue[]
  tips: CoachTip[]
  /** 서버 기록으로는 조건을 채웠는데 아이 기기에는 없는 뱃지 (되메우기 대상) */
  badgeOnlyInAdmin: string[]
  /** 아이 기기에만 있는 뱃지 (분류 상자·속사 사냥 등 서버로 되짚을 수 없는 것) */
  badgeOnlyInApp: string[]
  todaySec: number; todayAcc: number | null; accDelta: number | null
  todayXp: number; weekXp: number; totalXp: number
  /** v1.4.22 보상 로드맵 — 최근 14일 중 '학습한 날'의 하루 평균 XP (기준선 잡기·도착 예상용).
   *  안 한 날을 0으로 세지 않는다 — 그러면 평균이 꺼져 예상일이 비현실적으로 늘어난다. */
  paceXp: { avg: number; days: number }
  streak: number; completedCount: number
  dueToday: number; reviewedToday: boolean
  days7: { dow: string; acc: number | null }[]
  dayAgg: Record<string, { n: number; correct: number; sec: number }>
  weakAreas: { id: string; pct: number; total: number }[]
  weakspotsVocab: { text: string; module: string; n: number }[]
  vocabStats: {
    packsDone: number; perfect: number; words: number; golems: number; guardians: number
    acc: number | null; events: number; wordmonDist: number[]; legend: number; caught: number
    tierRows: { tier: number; done: number; perfect: number; golems: number; stage: number; golemsDue: number }[]
    weakVocab: { id: string; pct: number; total: number }[]
  }
  weakspots: { text: string; module: string; n: number }[]
  typeBreakdown: { type: string; total: number; correct: number; pct: number }[]
  respAvgMs: number | null; respBuckets: { label: string; n: number }[]
  mastery: { id: string; status: string; acc: number | null; attempts: number; timeSec: number; best: number | null; n: number; stars: number | null }[]
  boxDist: number[]; dueBuckets: { overdue: number; today: number; soon: number; later: number }
  reviewAcc: number | null; reviewCount: number; masteredCards: number
  earnedBadges: Set<string>
  worldProgress: { world: number; emoji: string; name: string; mods: { id: string; status: string }[]; done: number; total: number }[]
  todayBalance: { course: number; review: number }; weekBalance: { course: number; review: number }
}

function computeMetrics(
  events: AnswerEvent[], progress: ModProgress[], sessions: Session[], cards: ReviewCard[],
  badgeRows: BadgeRow[], learner: Learner | null, todayKey: string, yKey: string, weekStart: string,
  worldsReady: boolean, caps: { events: boolean; sessions: boolean }, failedTables: string[],
  xpEventsSum: number | null,
): Metrics {
  // ★v1.4.39★ toLocaleString 경유 비교는 이 함수 안에서만 수십만 번 불린다 → 전부 dayOf(고정 오프셋)로 통일.
  const dayOf = (iso: string) => kstDayOf(iso)
  const progMap = new Map(progress.map(p => [p.module_id, p]))

  /* ★★v1.4.40 — 아빠 PC 기록을 아이 지표에서 뺀다★★
     2026-08-16 실측: 기록된 세션 시간의 89.2%가 desktop(70.0시간 vs 폰 8.4시간)이었고,
     문항도 85건이 desktop 세션에서 나왔다. v1.4.37은 "PC 기록이 섞여 있어요"라고 **말만 했고
     빼지는 않았다.** 이제 실제로 뺀다 — 단, 경고는 계속 띄워야 하므로 원본은 따로 들고 있는다. */
  const rawSessions = sessions as unknown as MetricSession[]
  const excludedSess = excludedSessionIds(rawSessions)
  const pcEventCount = events.length - learnerEvents(events, excludedSess).length
  events = learnerEvents(events, excludedSess)
  sessions = learnerSessions(rawSessions) as unknown as Session[]

  const todayEvents = events.filter(e => dayOf(e.created_at) === todayKey)
  const todayCorrect = todayEvents.filter(e => e.is_correct).length
  const todayAcc = todayEvents.length ? Math.round((todayCorrect / todayEvents.length) * 100) : null

  /* ★★v1.4.35 — 학습 시간의 진실화★★
     예전 규칙: `Math.max(세션 duration 합, 활동 간격 합)`.
     이 max가 사고였다. 세션 duration은 ①입력이 없어도 30초마다 쌓이고 ②탭을 두 개 열면 서로 덮어써
     자기 세션의 벽시계보다 커진다. max는 **항상 그 오염된 쪽**을 고른다.
     2026-08-15 실측: 푼 문항 0개 / 세션 합 42,216초 → 화면에는 "오늘 학습 703분 · 목표 달성 ✓".
     이제는 문항 기록(증거)으로만 학습 시간을 세고, 켜 둔 시간은 '켜 둔 시간'으로 따로 부른다. */
  const metricEvents = events as unknown as MetricEvent[]
  const metricSessions = sessions as unknown as MetricSession[]
  const metricProgress = progress as unknown as MetricProgress[]
  const time = studyTimeOfDay(metricEvents, metricSessions, todayKey)
  /* ★v1.4.40 — "그러면 계산량은?"(L50)★
     예전 `daySecFromEvents`는 날짜마다 `events.some(...)` 전수 스캔 + `studyTimeOfDay`(내부에서 또 두 번 전수 필터)를
     불렀다. 즉 O(날짜수 × 문항수)다. 컨테이너 실측: 4,445문항 × 35일에서 dayAgg+week7만 **544ms**.
     120일 창이 다 차면 제곱으로 늘어난다 — v1.4.39가 100배 빠르게 만든 뒤에도 성장 곡선은 그대로였다.
     → 날짜별 타임스탬프 색인을 **한 번만** 만들고, 이후는 그 배열만 본다. O(n log n). */
  const tsByDay = new Map<string, number[]>()
  for (const e of events) {
    const t = Date.parse(e.created_at)
    if (!Number.isFinite(t)) continue
    const k = dayOf(e.created_at)
    const arr = tsByDay.get(k)
    if (arr) arr.push(t); else tsByDay.set(k, [t])
  }
  for (const arr of tsByDay.values()) arr.sort((a, b) => a - b)
  const daySecFromEvents = (key: string): number => {
    const arr = tsByDay.get(key)
    return arr && arr.length ? focusSecOfTimestamps(arr) : 0
  }
  const todaySec = time.focusSec

  const yEvents = events.filter(e => dayOf(e.created_at) === yKey)
  const yAcc = yEvents.length ? Math.round((yEvents.filter(e => e.is_correct).length / yEvents.length) * 100) : null
  const accDelta = todayAcc !== null && yAcc !== null ? todayAcc - yAcc : null

  // XP (앱 실제 규칙 + 보너스, 완료일 귀속) — 같은 날이면 오늘 XP = 누적 XP
  const bonusOn = (pred: (k: string) => boolean) => progress
    .filter(p => (p.status === 'completed' || p.status === 'mastered') && pred(dayOf(p.completed_at || p.updated_at)))
    .reduce((a, p) => a + moduleBonus(p), 0)
    // v1.3.0 유령 보스 최초 통과 보너스 — mastered_at 날짜에 귀속
    + progress.filter(p => p.mastered_at && pred(dayOf(p.mastered_at))).reduce((a, p) => a + ghostBonus(p), 0)
  // 복습 콤보 보너스 (일별 복습 정답 수 → 10장마다 +20, ReviewMine과 1:1)
  const reviewCorrectByDay: Record<string, number> = {}
  for (const e of events) {
    if (e.activity_type !== 'review' || !e.is_correct) continue
    const k = dayOf(e.created_at)
    reviewCorrectByDay[k] = (reviewCorrectByDay[k] || 0) + 1
  }
  const comboOn = (pred: (k: string) => boolean) =>
    Object.entries(reviewCorrectByDay).filter(([k]) => pred(k)).reduce((a, [, n]) => a + comboBonusOf(n), 0)
  const todayXp = todayEvents.reduce((a, e) => a + xpOf(e), 0) + bonusOn(k => k === todayKey) + comboOn(k => k === todayKey)
  const weekXp = events.filter(e => { const k = dayOf(e.created_at); return k >= weekStart && k <= todayKey }).reduce((a, e) => a + xpOf(e), 0)
    + bonusOn(k => k >= weekStart && k <= todayKey) + comboOn(k => k >= weekStart && k <= todayKey)
  // v1.4.22 페이스: 최근 14일 일별 XP → 학습한 날의 평균
  const paceXp = (() => {
    const from = addDays(todayKey, -13)
    const byDay: Record<string, number> = {}
    for (const e of events) {
      const k = dayOf(e.created_at)
      if (k >= from && k <= todayKey) byDay[k] = (byDay[k] || 0) + xpOf(e)
    }
    for (const k of Object.keys(byDay)) byDay[k] += bonusOn(x => x === k) + comboOn(x => x === k)
    const vals = Object.values(byDay).filter(v => v > 0)
    return vals.length ? { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), days: vals.length } : { avg: 0, days: 0 }
  })()
  // 누적 XP: 앱(learner.xp)과 활동로그 산출 중 큰 값 — 구버전(APK) 동기화 지연에도 계속 정확
  const totalXpData = events.reduce((a, e) => a + xpOf(e), 0)
    + progress.filter(p => p.status === 'completed' || p.status === 'mastered').reduce((a, p) => a + moduleBonus(p), 0)
    + progress.reduce((a, p) => a + ghostBonus(p), 0) // v1.3.0 유령 보스 보너스
    + comboOn(() => true)
  /* ★v1.4.40 — `Math.max`를 걷어낸다★
     `supabase.ts`가 직접 지목한 안티패턴이다: "아무도 몰랐던 이유는 누적 XP가 Math.max(앱 저장값, 파생값)으로
     **가려져** 있었기 때문이다." max는 언제나 큰 쪽을 고르므로 어느 한쪽이 부풀어도 화면이 조용해진다.
     앱이 아이에게 실제로 준 XP는 `learner.xp`다(아이 화면에 뜨는 그 숫자). 파생값은 최근 120일만 덮으므로
     이력이 120일을 넘으면 구조적으로 작아진다 — 헤드라인이 될 수 없다.
     → 헤드라인은 **저장값**, 파생값은 **감사(xp_gap)** 로만 쓴다. 차이는 진단 패널이 말한다(L47). */
  const totalXp = learner?.xp ?? 0
  // 학습 밸런스 (모험 vs 복습 XP — 50:50 목표)
  const balanceOf = (pred: (k: string) => boolean) => {
    let course = 0, review = 0
    for (const e of events) {
      const k = dayOf(e.created_at)
      if (!pred(k)) continue
      if (e.activity_type === 'review') review += xpOf(e)
      else course += xpOf(e)
    }
    review += comboOn(pred)
    course += bonusOn(pred)
    return { course, review }
  }
  const todayBalance = balanceOf(k => k === todayKey)
  const weekBalance = balanceOf(k => k >= weekStart && k <= todayKey)

  // ⚠️ v1.4.21 정합 수정: module_progress에는 학습 모듈 말고도 **어휘 팩 200개·단어 골렘 40개**가 들어온다.
  //    그대로 세면 "모듈 클리어 241/28" 같은 숫자가 나온다(실제로 그렇게 나오고 있었다).
  const completedCount = progress.filter(p => isLearnModuleId(p.module_id) && (p.status === 'completed' || p.status === 'mastered')).length

  // 복습
  const dueToday = cards.filter(c => c.due_date && c.due_date <= todayKey).length
  const reviewedToday = todayEvents.some(e => e.activity_type === 'review')
  const boxDist = [1, 2, 3, 4, 5].map(b => cards.filter(c => c.box === b).length)
  const dueBuckets = {
    overdue: cards.filter(c => c.due_date && c.due_date < todayKey).length,
    today: cards.filter(c => c.due_date === todayKey).length,
    soon: cards.filter(c => c.due_date && c.due_date > todayKey && c.due_date <= addDays(todayKey, 3)).length,
    later: cards.filter(c => c.due_date && c.due_date > addDays(todayKey, 3)).length,
  }
  const reviewEvents = events.filter(e => e.activity_type === 'review')
  const reviewAcc = reviewEvents.length ? Math.round((reviewEvents.filter(e => e.is_correct).length / reviewEvents.length) * 100) : null
  const masteredCards = cards.filter(c => c.box >= 5).length

  // 7일 정답률 추이
  const days7: { dow: string; acc: number | null }[] = []
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i)
    const key = dt.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
    // ★v1.4.35★ 추이는 **신규 학습**만 본다. 복습(99.8%)·자기 채점(말하기 100%)·문장 발견(100%)을
    //   섞으면 그래프가 실력이 아니라 '그날 복습 비중'을 그린다.
    const a = accuracyOf(events.filter(e => dayOf(e.created_at) === key) as unknown as MetricEvent[])
    days7.push({ dow: DOW_KO[new Date(`${key}T00:00:00Z`).getUTCDay()], acc: a.newPct })
  }

  // 캘린더 히트맵용 일별 집계
  const dayAgg: Record<string, { n: number; correct: number; sec: number }> = {}
  for (const e of events) {
    const k = dayOf(e.created_at)
    if (!dayAgg[k]) dayAgg[k] = { n: 0, correct: 0, sec: 0 }
    dayAgg[k].n++; if (e.is_correct) dayAgg[k].correct++
  }
  for (const k of Object.keys(dayAgg)) dayAgg[k].sec = daySecFromEvents(k)

  // 취약 영역 (개념=모듈 단위, 표본 5+)
  const modAgg: Record<string, { total: number; correct: number }> = {}
  for (const e of events) {
    // ★v1.4.35★ 채점이 아닌 것(진단·문장 발견)과 자기 채점(말하기)은 취약 영역 분모에서 뺀다.
    //   말하기는 아이가 "말했다"를 누르면 무조건 정답이라, 두면 약한 단원이 멀쩡해 보인다.
    //   ★v1.4.40★ 복습도 뺀다. `isAssessed`는 복습을 통과시켜서 취약 영역이 통째로 희석돼 있었다
    //   (실측 R0: 화면 70% ↔ 신규 39%). 순위가 뒤바뀌어 **엉뚱한 단원이 처방으로 나갔다.**
    if (!isNewLearning(e as unknown as MetricEvent)) continue
    if (!modAgg[e.module_id]) modAgg[e.module_id] = { total: 0, correct: 0 }
    modAgg[e.module_id].total++; if (e.is_correct) modAgg[e.module_id].correct++
  }
  // 학습 모듈 취약 영역 (어휘 팩 200개가 섞이면 문법 취약점이 묻힌다 — 분리한다)
  const weakAreas = Object.entries(modAgg).filter(([id, v]) => v.total >= 5 && isLearnModuleId(id))
    .map(([id, v]) => ({ id, pct: Math.round((v.correct / v.total) * 100), total: v.total }))
    .sort((a, b) => a.pct - b.pct)
  // 어휘 취약 구역 (팩·골렘 단위)
  const weakVocab = Object.entries(modAgg).filter(([id, v]) => v.total >= 5 && (VOCAB_PACK_RE.test(id) || GOLEM_RE.test(id)))
    .map(([id, v]) => ({ id, pct: Math.round((v.correct / v.total) * 100), total: v.total }))
    .sort((a, b) => a.pct - b.pct)

  // 반복 오답 TOP
  const wrongCount: Record<string, { text: string; module: string; n: number }> = {}
  for (const e of events.filter(e => !e.is_correct)) {
    const k = e.question_id
    if (!wrongCount[k]) wrongCount[k] = { text: e.question_text || e.question_id, module: e.module_id, n: 0 }
    wrongCount[k].n++
  }
  const allWrong = Object.values(wrongCount).sort((a, b) => b.n - a.n)
  const weakspots = allWrong.filter(w => isLearnModuleId(w.module)).slice(0, 8)
  const weakspotsVocab = allWrong.filter(w => !isLearnModuleId(w.module)).slice(0, 8)

  // 활동 유형별 정답률
  const typeAgg: Record<string, { total: number; correct: number }> = {}
  for (const e of events) {
    if (!typeAgg[e.activity_type]) typeAgg[e.activity_type] = { total: 0, correct: 0 }
    typeAgg[e.activity_type].total++; if (e.is_correct) typeAgg[e.activity_type].correct++
  }
  const typeBreakdown = Object.entries(typeAgg).map(([type, v]) => ({ type, total: v.total, correct: v.correct, pct: Math.round((v.correct / v.total) * 100) }))
    .sort((a, b) => b.total - a.total)

  // 응답시간
  const rts = events.map(e => e.response_ms).filter((x): x is number => x != null && x > 0)
  const respAvgMs = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null
  const respBuckets = [
    { label: '~3초', n: rts.filter(x => x < 3000).length },
    { label: '3~7초', n: rts.filter(x => x >= 3000 && x < 7000).length },
    { label: '7~15초', n: rts.filter(x => x >= 7000 && x < 15000).length },
    { label: '15초+', n: rts.filter(x => x >= 15000).length },
  ]

  // ── v1.4.21 단어 대륙 지표 (관제실 정합) ─────────────────────────────
  const vocabEvents = events.filter(e => e.activity_type === 'vocab')
  const vocabAcc = vocabEvents.length ? Math.round((vocabEvents.filter(e => e.is_correct).length / vocabEvents.length) * 100) : null
  const vocabCards = cards.filter(c => c.card_id.startsWith('vocab:'))
  const wordmonDist = [1, 2, 3, 4, 5].map(b => vocabCards.filter(c => c.box === b).length)
  const packDone = new Map<string, ModProgress>()
  for (const p of progress) if (VOCAB_PACK_RE.test(p.module_id) && (p.status === 'completed' || p.status === 'mastered')) packDone.set(p.module_id, p)
  const golemDone = new Set(progress.filter(p => GOLEM_RE.test(p.module_id) && (p.status === 'completed' || p.status === 'mastered')).map(p => p.module_id))
  const tierRows = Array.from({ length: 10 }, (_, i) => {
    const t = i + 1
    const done = [...packDone.keys()].filter(id => Number(VOCAB_PACK_RE.exec(id)![1]) === t).length
    const perfect = [...packDone.entries()].filter(([id, p]) => Number(VOCAB_PACK_RE.exec(id)![1]) === t && (p.best_score ?? 0) >= 90).length
    const golems = [1, 2, 3, 4].filter(k => golemDone.has(`GOLEM-T${t}-${k}`)).length
    // 각성 단계는 앱과 같은 규칙(5팩마다 1단계) — lib/vocab.awakenStage와 1:1
    return { tier: t, done, perfect, golems, stage: Math.max(0, Math.min(4, Math.floor(done / 5))), golemsDue: Math.floor(done / 5) }
  })
  const vocabStats = {
    packsDone: packDone.size,
    perfect: [...packDone.values()].filter(p => (p.best_score ?? 0) >= 90).length,
    words: packDone.size * 12,
    golems: golemDone.size,
    guardians: tierRows.filter(r => r.stage >= 4).length,
    acc: vocabAcc, events: vocabEvents.length,
    wordmonDist, legend: wordmonDist[4], caught: vocabCards.length,
    tierRows, weakVocab: weakVocab.slice(0, 5),
  }

  // 모듈 마스터리 — ★v1.4.35★ 아이 화면에 열려 있으면 월드 7~10(24개)도 함께 본다.
  //   예전에는 MODULE_ORDER(28개)만 돌아, 열려 있는 월드의 학습 결과가 관제실에서 통째로 보이지 않았다.
  const masteryIds = worldsReady ? [...MODULE_ORDER, ...EXT_MODULE_ORDER] : MODULE_ORDER
  const mastery = masteryIds.map(id => {
    const p = progMap.get(id)
    // ★v1.4.40★ 예전엔 `activity_type !== 'diagnostic'` 하나만 걸러서 말하기(자기채점 100%)·
    //   문장 발견(항상 100%)·복습(99.9%)이 전부 분모에 있었다. 취약 영역과 **같은 기준**을 쓴다.
    const evs = events.filter(e => e.module_id === id && isNewLearning(e as unknown as MetricEvent))
    const acc = evs.length ? Math.round((evs.filter(e => e.is_correct).length / evs.length) * 100) : null
    return { id, status: p?.status || 'locked', acc, attempts: p?.attempts || 0, timeSec: p?.total_time_seconds || 0, best: p?.best_score ?? null, n: evs.length, stars: p?.stars ?? null }
  })

  // ── 뱃지 ──────────────────────────────────────────────────────────
  // ★L27★ 판정 규칙을 여기에 다시 쓰지 않는다. 서버 행에서 **사실(facts)만** 만들고
  //   규칙은 lib/badges.ts의 earnedFrom() 하나만 쓴다.
  //   (v1.4.20까지는 이 자리에 규칙이 통째로 복사돼 있었다 — 한쪽만 고치면 아이 화면과 관제실이 갈라진다.)
  const doneIds = progress.filter(p => p.status === 'completed' || p.status === 'mastered').map(p => p.module_id)
  const vocabPacks = doneIds.filter(id => VOCAB_PACK_RE.test(id))
  const dayKinds: Record<string, { course: boolean; review: boolean }> = {}
  for (const e of events) {
    if (e.activity_type === 'diagnostic') continue
    const k = dayOf(e.created_at)
    if (!dayKinds[k]) dayKinds[k] = { course: false, review: false }
    if (e.activity_type === 'review') dayKinds[k].review = true
    else dayKinds[k].course = true
  }
  const facts: BadgeFacts = {
    // v1.4.25: 월드 7~10 포함 — badges.ts의 factsFromLocal과 같은 기준이어야 badge_check가 통과한다(L27)
    modulesDone: doneIds.filter(id => MODULE_ORDER.includes(id) || EXT_MODULE_ORDER.includes(id)),
    perfectModule: progress.some(p => !p.module_id.startsWith('DIAG-') && !VOCAB_PACK_RE.test(p.module_id) && !GOLEM_RE.test(p.module_id) && (p.best_score ?? 0) >= 100),
    // v1.4.27 — badges.ts factsFromLocal과 같은 기준(월드 7~10 퍼펙트)
    perfectExt: progress.some(p => EXT_MODULE_ORDER.includes(p.module_id) && (p.best_score ?? 0) >= 100),
    diagDone: progress.filter(p => p.module_id.startsWith('DIAG-') && (p.status === 'completed' || p.status === 'mastered')).length,
    streak: learner?.streak_days ?? 0,
    bossWins: new Set(events.filter(e => e.activity_type === 'boss' && e.is_correct).map(e => e.module_id)).size,
    reviewCorrect: reviewEvents.filter(e => e.is_correct).length,
    balanceDays: Object.values(dayKinds).filter(v => v.course && v.review).length,
    forgeFound: new Set(events.filter(e => e.activity_type === 'forge_discover').map(e => e.question_id || e.question_text || '')).size,
    runeChapters: RUNE_MODULES.filter(id => doneIds.includes(id)).length,
    vocabPacks,
    vocabPerfect: progress.filter(p => VOCAB_PACK_RE.test(p.module_id) && (p.status === 'completed' || p.status === 'mastered') && (p.best_score ?? 0) >= 90).length,
    golems: doneIds.filter(id => GOLEM_RE.test(id)).length,
    // 👑 전설 워드몬 = 어휘 복습 카드 중 박스 5 (관제실은 서버 카드에서 직접 센다 — 앱 로컬 카운터보다 정확)
    legendWords: cards.filter(c => c.card_id.startsWith('vocab:') && (c.box ?? 0) >= 5).length,
    // 아래 둘은 앱 로컬 판정(localOnly) — 관제실은 badges 테이블 값으로만 본다
    sortPerfect: 0,
    rapidBest: 0,
  }
  const earnedBadges = new Set<string>(earnedFrom(facts))

  // 월드 진행 — ★v1.4.35★ 열려 있으면 월드 7~10도 지도에 그린다(아이 화면과 같은 목록).
  const worldProgress = (worldsReady ? [...WORLDS, ...EXT_WORLDS] : WORLDS).filter(w => w.modules.length).map(w => {
    const mods = w.modules.map(id => ({ id, status: progMap.get(id)?.status || 'locked' }))
    const done = mods.filter(m => m.status === 'completed' || m.status === 'mastered').length
    return { world: w.world, emoji: w.emoji, name: w.name_ko, mods, done, total: w.modules.length }
  })

  /* ═══ v1.4.35 진실 계층 — 규칙은 전부 lib/adminMetrics.ts에 있다 ═══ */
  const accToday = accuracyOf(metricEvents.filter(e => dayOf(e.created_at) === todayKey))
  const from7 = addDays(todayKey, -6)
  const acc7 = accuracyOf(metricEvents.filter(e => { const k = dayOf(e.created_at); return k >= from7 && k <= todayKey }))
  const prog = progressView(metricProgress, worldsReady)
  const debt = reviewDebtOf(cards as unknown as { card_id: string; box: number; due_date: string | null }[], metricEvents, todayKey)
  const xpChk = xpAudit(metricEvents, metricProgress, learner?.xp ?? 0, caps.events)

  // 뱃지 정합 — 관제실 파생(서버 사실 기반) vs 아이 기기가 실제로 받은 것(badges 테이블).
  // 예전에는 둘을 그냥 합집합으로 보여 줘서, 아이 화면엔 없는 뱃지를 아빠만 보고 있었다(실측 25 vs 28).
  const tableIds = new Set(badgeRows.map(b => b.badge_id))
  const badgeOnlyInAdmin = [...earnedBadges].filter(id => !tableIds.has(id) && BADGE_DEFS[id] && !BADGE_DEFS[id].localOnly)
  const badgeOnlyInApp = [...tableIds].filter(id => !earnedBadges.has(id))

  // ★v1.4.40★ week7만은 **원본 세션**으로 만든다 — desktop을 지표에서 뺐어도
  //   "아빠가 PC로 열었다"는 사실 자체는 계속 알려야 하기 때문이다(뺐다는 것도 알려야 한다).
  /* v1.4.40-b — week7에서 실제로 쓰는 값은 `devices` 하나뿐인데(진단 패널의 PC 혼입 판정),
     `studyTimeOfDay`를 7번 부르면 내부에서 문항을 14번 전수 필터한다. 세션만 훑으면 된다. */
  const week7: StudyTime[] = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(todayKey, -i)
    const devs = Array.from(new Set(rawSessions.filter(s => dayOf(s.started_at) === key).map(s => s.device || '알 수 없음'))).sort()
    return { focusSec: 0, openSec: 0, rawSessionSec: 0, answers: 0, idleSuspect: false, corruptSessions: 0, devices: devs }
  })
  // 월드 7~10을 "한 번도 안 들어갔다"고 말하려면 완료 여부가 아니라 **기록**을 봐야 한다.
  //   (실측: P1에 이미 6문항이 있는데 진단 패널은 "통째로 비어 있어요"라고 말하고 있었다)
  const extTouched = events.some(e => EXT_MODULE_ORDER.includes(e.module_id))
  /* v1.4.40 — 진도 시스템 밖의 학습. 2026-08-16 실측으로 전체의 20.6%(911문항)가 여기였다:
     지령 미션 CMD 619 · 복습(카드 규칙 밖) 144 · 문장 소환진 FORGE 130 · 에코 12 · P1 6.
     아이는 619문항을 풀었는데 진도바가 1도 안 움직인다 — 결함은 아니지만 큰 누락이다. */
  const trackedIds = new Set([...MODULE_ORDER, ...EXT_MODULE_ORDER])
  const offTrackCount = events.filter(e =>
    !trackedIds.has(e.module_id) && !VOCAB_PACK_RE.test(e.module_id) && !GOLEM_RE.test(e.module_id)
    && e.activity_type !== 'diagnostic').length
  const issues = integrityCheck({
    today: time, week: week7, xp: xpChk, progress: prog, debt,
    badgeOnlyInAdmin, badgeOnlyInApp, extTouched, pcEventCount, acc7, offTrackCount, xpEventsSum: xpEventsSum ?? undefined,
    eventsTruncated: caps.events, sessionsTruncated: caps.sessions, failedTables,
  })
  const weakest = weakAreas.length ? { name: moduleName(weakAreas[0].id), pct: weakAreas[0].pct } : null
  const tips = coachTips({ today: time, acc7, debt, progress: prog, weakest, streak: facts.streak })

  return {
    todayEvents, time, accToday, acc7, prog, debt, xpChk, issues, tips, badgeOnlyInAdmin, badgeOnlyInApp,
    todaySec, todayAcc, accDelta, todayXp, weekXp, totalXp, paceXp, streak: facts.streak, completedCount,
    dueToday, reviewedToday, days7, dayAgg, weakAreas, weakspots, weakspotsVocab, typeBreakdown, respAvgMs, respBuckets, vocabStats,
    mastery, boxDist, dueBuckets, reviewAcc, reviewCount: reviewEvents.length, masteredCards, earnedBadges, worldProgress,
    todayBalance, weekBalance,
  }
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

/* ═══════════════ 탭: 개요 ═══════════════ */
function OverviewTab(props: {
  M: Metrics; lp: { level: number; cur: number; need: number }; learner: Learner | null
  onSeeAll: () => void; onBackfilled: (ids: string[]) => void
}) {
  const { M, lp } = props
  return (
    <div className="adm-screen">
      {/* ★v1.4.35★ 아빠가 이 두 패널만 보고 나가도 손해가 없어야 한다 —
          ① 오늘 뭘 하면 되는지 ② 이 화면의 숫자를 믿어도 되는지. */}
      <TodayBriefing time={M.time} acc={M.accToday} debt={M.debt} progress={M.prog}
        streak={M.streak} todayXp={M.todayXp} tips={M.tips} />
      <IntegrityPanel issues={M.issues} learnerId={props.learner?.id ?? null}
        badgeOnlyInAdmin={M.badgeOnlyInAdmin} onBackfilled={props.onBackfilled} />

      <div className="stat-row">
        <div className="stat-tile"><b>⭐ {M.totalXp.toLocaleString()}</b><span>누적 XP · LV.{lp.level}</span></div>
        <div className="stat-tile"><b>{M.prog.done}/{M.prog.total}</b><span>모듈 클리어</span></div>
        <div className="stat-tile" title="출석 기준: 하루 15분 이상 '문제를 푼' 시간 (앱을 켜 두기만 한 시간은 제외)"><b>🔥 {M.streak}</b><span>연속 출석 (15분↑)</span></div>
      </div>

      <div className="adm-panel adm-chart">
        <h4>정답률 추이 · 최근 7일 <span className="adm-sub">신규 학습만 — 복습은 구조적으로 100%에 가까워 섞으면 실력이 안 보입니다</span></h4>
        <TrendChart days={M.days7} />
      </div>

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h4>최근 활동</h4>
          <button className="adm-view-btn" onClick={props.onSeeAll}>전체 보기 ▸</button>
        </div>
        {M.todayEvents.length === 0 ? <p className="admin-empty">오늘 기록이 아직 없어요.</p> : (
          <div className="adm-feed">
            {M.todayEvents.slice(0, 12).map(e => (
              <div key={e.id} className="adm-feed-wrap">
                <div className="adm-feed-row">
                  <time>{new Date(e.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' })}</time>
                  <span className="what"><em>[{feedTag(e)}]</em> {e.question_text || e.question_id}</span>
                  {e.is_correct ? <span className="adm-pill o">정답</span> : <span className="adm-pill x">오답</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ 탭: 활동 (캘린더 + 필터 피드) ═══════════════ */
type FeedFilter = 'all' | 'wrong' | 'review' | 'boss' | 'game' | 'speak'
const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'wrong', label: '오답만' }, { id: 'review', label: '복습' },
  { id: 'boss', label: '보스전' }, { id: 'game', label: '게임' }, { id: 'speak', label: '말하기' },
]
function matchFilter(e: AnswerEvent, f: FeedFilter): boolean {
  if (f === 'all') return true
  if (f === 'wrong') return !e.is_correct
  if (f === 'review') return e.activity_type === 'review'
  if (f === 'boss') return e.activity_type === 'boss' || e.activity_type === 'ghost' // v1.3.0 유령 보스 포함
  if (f === 'speak') return e.activity_type === 'speak'
  if (f === 'game') return e.activity_type.startsWith('game_')
  return true
}

function ActivityTab(props: { events: AnswerEvent[]; todayKey: string; yKey: string; dayAgg: Record<string, { n: number; correct: number; sec: number }>; onSeeAll: () => void }) {
  const { events, todayKey, yKey, dayAgg } = props
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [selDay, setSelDay] = useState<string>(todayKey)
  const [month, setMonth] = useState<string>(() => todayKey.slice(0, 7)) // 'YYYY-MM'

  const dayEvents = useMemo(() =>
    events.filter(e => kstDate(e.created_at) === selDay).slice().sort((a, b) => a.created_at < b.created_at ? -1 : 1)
  , [events, selDay])
  const filtered = dayEvents.filter(e => matchFilter(e, filter))
  const dayStat = dayAgg[selDay]

  return (
    <div className="adm-screen">
      <div className="adm-panel">
        <h4>학습 캘린더 <span className="adm-sub">색이 진할수록 그날 많이 공부한 거예요</span></h4>
        <Calendar month={month} onMonth={setMonth} dayAgg={dayAgg} selected={selDay} onSelect={setSelDay} todayKey={todayKey} />
        <div className="cal-legend">
          <span>적음</span>
          <i className="cal-sw l0" /><i className="cal-sw l1" /><i className="cal-sw l2" /><i className="cal-sw l3" /><i className="cal-sw l4" />
          <span>많음</span>
        </div>
      </div>

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h4>{dateLabel(selDay, todayKey, yKey)}의 활동</h4>
          <button className="adm-view-btn" onClick={props.onSeeAll}>문제 다시보기 ▸</button>
        </div>
        {dayStat ? (
          <div className="day-summary">
            <span><b>{dayStat.n}</b>문항</span>
            <span><b>{dayStat.n ? Math.round((dayStat.correct / dayStat.n) * 100) : 0}%</b> 정답</span>
            <span><b>{Math.floor(dayStat.sec / 60)}</b>분</span>
          </div>
        ) : <p className="admin-empty">이 날은 학습 기록이 없어요.</p>}

        {dayStat && (
          <>
            <div className="adm-filter">
              {FILTERS.map(f => (
                <button key={f.id} className={`adm-chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
            {filtered.length === 0 ? <p className="admin-empty">해당하는 기록이 없어요.</p> : (
              <div className="adm-feed">
                {filtered.map(e => {
                  const hasMore = (!e.is_correct && e.given_answer) || e.response_ms != null
                  const row = (
                    <div className="adm-feed-row">
                      <time>{new Date(e.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' })}</time>
                      <span className="what"><em>[{feedTag(e)}]</em> {e.question_text || e.question_id}</span>
                      {e.is_correct ? <span className="adm-pill o">정답</span> : <span className="adm-pill x">오답</span>}
                    </div>
                  )
                  return hasMore ? (
                    <details key={e.id}>
                      <summary>{row}</summary>
                      <div className="adm-feed-more">
                        {!e.is_correct && e.given_answer && <>답: "{e.given_answer}" → 정답: "{e.correct_answer}" · </>}
                        {e.response_ms != null && <>{(e.response_ms / 1000).toFixed(1)}초</>}
                      </div>
                    </details>
                  ) : <div key={e.id} className="adm-feed-wrap">{row}</div>
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Calendar(props: { month: string; onMonth: (m: string) => void; dayAgg: Record<string, { n: number; correct: number; sec: number }>; selected: string; onSelect: (k: string) => void; todayKey: string }) {
  const { month, dayAgg, selected, todayKey } = props
  const year = parseInt(month.slice(0, 4), 10)
  const mon = parseInt(month.slice(5, 7), 10) // 1-12
  const first = new Date(Date.UTC(year, mon - 1, 1))
  const startDow = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  const level = (n: number) => n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1))
    props.onMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <div className="cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => shift(-1)}>◂</button>
        <b>{year}년 {mon}월</b>
        <button className="cal-nav" onClick={() => shift(1)} disabled={month >= todayKey.slice(0, 7)}>▸</button>
      </div>
      <div className="cal-grid">
        {DOW_KO.map(d => <span key={d} className="cal-dow">{d}</span>)}
        {cells.map((k, i) => {
          if (!k) return <span key={`b${i}`} className="cal-cell empty" />
          const agg = dayAgg[k]
          const lv = agg ? level(agg.n) : 0
          const isToday = k === todayKey
          const isSel = k === selected
          const future = k > todayKey
          return (
            <button key={k} className={`cal-cell l${lv} ${isSel ? 'sel' : ''} ${isToday ? 'today' : ''} ${future ? 'future' : ''}`}
              disabled={future} onClick={() => props.onSelect(k)}
              title={agg ? `${k}: ${agg.n}문항 · ${agg.n ? Math.round((agg.correct / agg.n) * 100) : 0}%` : k}>
              {parseInt(k.slice(8), 10)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════ 탭: 복습 (SRS) ═══════════════ */
function ReviewTab(props: { M: Metrics; cards: ReviewCard[] }) {
  const { M, cards } = props
  const total = cards.length
  return (
    <div className="adm-screen">
      <div className="adm-stat-grid">
        <div className="adm-stat"><span className="k">🃏 전체 카드</span><span className="v">{total}장</span><span className="d flat">라이트너 5칸</span></div>
        <div className="adm-stat"><span className="k">💎 장기기억</span><span className="v">{M.masteredCards}장</span><span className="d flat">전체 카드 중 박스5</span></div>
        <div className="adm-stat"><span className="k">🎯 복습 정답률</span><span className="v">{M.reviewAcc === null ? '—' : `${M.reviewAcc}%`}</span><span className="d flat">누적 {M.reviewCount}회</span></div>
        <div className="adm-stat"><span className="k">📅 오늘 예정</span><span className="v">{M.dueToday}장</span>{M.reviewedToday ? <span className="d up">완료 ✓</span> : <span className="d flat">대기</span>}</div>
      </div>

      <div className="adm-panel">
        <h4>학습 밸런스 <span className="adm-sub">목표 = 모험:복습 50:50 (복습 카드 +{XP.reviewCorrect} XP · {XP.reviewComboEvery}장 콤보 +{XP.reviewCombo})</span></h4>
        <BalanceRow label="오늘" b={M.todayBalance} />
        <BalanceRow label="이번 주" b={M.weekBalance} />
        <p className="admin-note">복습 비중이 낮으면 예한이 앱 월드맵의 '오늘의 밸런스' 미터가 복습을 권해요. 오답 문제는 자동으로 복습 카드로 리스폰됩니다.</p>
      </div>

      {total === 0 ? (
        <div className="adm-panel">
          <h4>복습 광산 (간격 반복)</h4>
          <p className="admin-empty">아직 복습 카드가 없어요. 모듈을 클리어하면 다음 날부터 복습 카드가 광산에 리젠돼요 — 라이트너 5칸(오늘·2일·4일·7일·14일) 간격으로 장기기억까지 굳혀줍니다.</p>
        </div>
      ) : (
        <>
          <div className="adm-panel">
            <h4>박스 분포 (많이 맞힐수록 오른쪽 다이아 층으로)</h4>
            <div className="adm-dist">
              {M.boxDist.map((n, i) => n > 0 ? <i key={i} style={{ width: `${(n / total) * 100}%`, background: BOX_COLORS[i] }} /> : null)}
            </div>
            <div className="rv-boxrows">
              {M.boxDist.map((n, i) => (
                <div key={i} className="rv-boxrow">
                  <span className="sq" style={{ background: BOX_COLORS[i] }} />
                  <span className="rv-boxlabel">{BOX_LABELS[i]}</span>
                  <span className="rv-boxn">{n}장</span>
                  <span className="rv-boxbar"><i style={{ width: `${total ? (n / total) * 100 : 0}%`, background: BOX_COLORS[i] }} /></span>
                </div>
              ))}
            </div>
          </div>

          <div className="adm-panel">
            <h4>복습 일정</h4>
            <div className="rv-due">
              <div className="rv-due-cell overdue"><b>{M.dueBuckets.overdue}</b><span>밀림</span></div>
              <div className="rv-due-cell today"><b>{M.dueBuckets.today}</b><span>오늘</span></div>
              <div className="rv-due-cell soon"><b>{M.dueBuckets.soon}</b><span>3일 내</span></div>
              <div className="rv-due-cell later"><b>{M.dueBuckets.later}</b><span>이후</span></div>
            </div>
          </div>

          {/* ★v1.4.35★ 복습 부채 — 숫자만 던지지 않고 '언제 갚아지는지'까지 말한다 */}
          <div className="adm-panel">
            <h4>밀린 복습 <span className="adm-sub">지금 캘 수 있는 카드 {M.debt.due}장</span></h4>
            {M.debt.due === 0 ? (
              <p className="admin-empty">밀린 카드가 없어요. 지금이 새 단원을 나가기 가장 좋은 상태입니다.</p>
            ) : (
              <p className="admin-note" style={{ margin: 0 }}>
                기한이 지난 카드 <b>{M.debt.overdue}장</b>
                {M.debt.oldestOverdueDays > 0 && <> · 가장 오래된 건 <b>{M.debt.oldestOverdueDays}일</b> 지났어요</>}.
                {' '}최근 페이스는 하루 {M.debt.pacePerDay}장
                {M.debt.daysToClear !== null ? <> — 이대로면 <b>약 {M.debt.daysToClear}일</b>이면 다 갚습니다.</> : ' — 최근 복습 기록이 없어 예상 일수를 낼 수 없어요.'}
                {M.debt.overCapacity && <><br />하루 15~20분으로는 <b>{DAILY_REVIEW_CAPACITY}장</b> 안팎이 한계예요. 새 진도를 잠시 멈추고 복습만 하는 편이 기억에 훨씬 남습니다.</>}
              </p>
            )}
          </div>

          <div className="adm-panel">
            {/* 예전에는 박스 높은 순 40장만 보여 줬다 — 잘 외운 카드만 보이고 **정작 못 외우는 카드는 안 보였다.** */}
            <h4>지금 가장 흔들리는 카드 <span className="adm-sub">최근 오답 · 낮은 박스 순</span></h4>
            <div className="rv-cards">
              {[...cards].sort((a, b) =>
                (Number(a.last_result === false ? 0 : 1) - Number(b.last_result === false ? 0 : 1))
                || ((a.box || 1) - (b.box || 1))
                || (b.review_count - a.review_count),
              ).slice(0, 30).map((c, i) => (
                <div key={`w${i}`} className="rv-card">
                  <span className="rv-card-box" style={{ background: BOX_COLORS[(c.box || 1) - 1] }}>{c.box}</span>
                  <span className="rv-card-front">{c.card_front || c.card_id}</span>
                  <span className="rv-card-meta">{c.review_count}회{c.last_result === false ? ' · 최근 오답' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="adm-panel">
            <h4>카드별 성취 (박스 높은 순)</h4>
            <div className="rv-cards">
              {cards.slice(0, 40).map((c, i) => (
                <div key={i} className="rv-card">
                  <span className="rv-card-box" style={{ background: BOX_COLORS[(c.box || 1) - 1] }}>{c.box}</span>
                  <span className="rv-card-front">{c.card_front || c.card_id}</span>
                  <span className="rv-card-meta">{c.review_count}회{c.last_result === false ? ' · 최근 오답' : c.last_result === true ? ' · 최근 정답' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** 모험 vs 복습 XP 밸런스 바 (50:50 목표선 포함) */
function BalanceRow(props: { label: string; b: { course: number; review: number } }) {
  const { course, review } = props.b
  const total = course + review
  const pct = total ? Math.round((review / total) * 100) : 0
  return (
    <div className="adm-balance-row">
      <span className="lbl">{props.label}</span>
      {total === 0 ? <span className="adm-balance-none">기록 없음</span> : (
        <>
          <span className="adm-balance-bar">
            <i className="c" style={{ width: `${100 - pct}%` }} />
            <i className="r" style={{ width: `${pct}%` }} />
            <em />
          </span>
          <span className="nums">모험 {course} : 복습 {review} ({pct}%)</span>
        </>
      )}
    </div>
  )
}

/* ═══════════════ 탭: 심층 분석 ═══════════════ */
function AnalysisTab(props: { M: Metrics }) {
  const { M } = props
  return (
    <div className="adm-screen">
      <div className="adm-panel">
        <h4>취약 영역 <span className="adm-sub">최근 120일 누적 · 개념별 5문항 이상 · 말하기/진단/문장 발견 제외</span></h4>
        {M.weakAreas.length === 0 ? <p className="admin-empty">표본이 아직 부족해요 (개념별 5문항 이상).</p> : (
          <div className="adm-weak">
            {M.weakAreas.slice(0, 8).map(w => {
              const col = w.pct < 70 ? 'var(--redstone)' : w.pct < 85 ? 'var(--gold)' : 'var(--success)'
              return (
                <div key={w.id} className="adm-weak-row">
                  <span className="nm">{moduleName(w.id)}</span>
                  <span className="bar"><i style={{ width: `${w.pct}%`, background: col }} /></span>
                  <span className="pc" style={{ color: col }}>{w.pct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="adm-panel">
        <h4>활동 유형별 정답률</h4>
        <p className="admin-note" style={{ margin: '0 0 8px' }}>
          ⚠️ <b>말하기</b>는 아이가 "말했어요"를 누르면 항상 정답, <b>문장 발견</b>·<b>진단</b>은 채점이 아닙니다.
          {' '}이 세 가지는 위 취약 영역과 개요의 정답률에서 빼고 계산해요 — 여기서는 참고용으로만 보여 줍니다.
        </p>
        {M.typeBreakdown.length === 0 ? <p className="admin-empty">기록이 없어요.</p> : (
          <div className="adm-weak">
            {M.typeBreakdown.map(t => {
              const col = t.pct < 70 ? 'var(--redstone)' : t.pct < 85 ? 'var(--gold)' : 'var(--success)'
              return (
                <div key={t.type} className="adm-weak-row">
                  <span className="nm">{typeLabel(t.type)} <em className="ana-n">{t.correct}/{t.total}</em></span>
                  <span className="bar"><i style={{ width: `${t.pct}%`, background: col }} /></span>
                  <span className="pc" style={{ color: col }}>{t.pct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="adm-panel">
        <h4>반응 속도 <span className="adm-sub">평균 {M.respAvgMs === null ? '—' : `${(M.respAvgMs / 1000).toFixed(1)}초`}</span></h4>
        <div className="ana-resp">
          {M.respBuckets.map(b => {
            const max = Math.max(1, ...M.respBuckets.map(x => x.n))
            return (
              <div key={b.label} className="ana-resp-col">
                <div className="ana-resp-bar"><i style={{ height: `${(b.n / max) * 100}%` }} /></div>
                <span className="ana-resp-n">{b.n}</span>
                <span className="ana-resp-l">{b.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="adm-panel">
        <h4>자주 틀리는 문제 TOP</h4>
        {M.weakspots.length === 0 ? <p className="admin-empty">반복 오답이 없어요 — 좋은 신호!</p> : (
          <ul className="weak-list">
            {M.weakspots.map((w, i) => (
              <li key={i}><span className="weak-n">{w.n}회</span> <b>[{moduleName(w.module)}]</b> {w.text}</li>
            ))}
          </ul>
        )}
        {/* v1.4.21 — 어휘 오답은 문항 수가 압도적이라 같은 목록에 두면 문법 오답이 묻힌다. 분리 표시. */}
        {M.weakspotsVocab.length > 0 && (
          <>
            <p className="adm-sub" style={{ margin: '12px 0 4px' }}>🗺️ 단어 대륙 반복 오답</p>
            <ul className="weak-list">
              {M.weakspotsVocab.map((w, i) => (
                <li key={i}><span className="weak-n">{w.n}회</span> <b>[{moduleName(w.module)}]</b> {w.text}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="adm-panel">
        <h4>모듈별 마스터리</h4>
        <div className="mastery">
          {M.mastery.map(m => {
            const cls = m.status === 'completed' || m.status === 'mastered' ? 'done' : m.status === 'in_progress' ? 'doing' : m.status === 'available' ? 'open' : 'locked'
            const col = m.acc === null ? 'var(--text-2)' : m.acc < 70 ? 'var(--redstone)' : m.acc < 85 ? 'var(--gold)' : 'var(--success)'
            return (
              <div key={m.id} className={`mastery-row ${cls}`}>
                <span className="mastery-id">{m.id}</span>
                <span className="mastery-nm">{moduleName(m.id)}{m.stars ? <em className="mastery-ghost" title="유령 보스 별 (장기기억 검증)"> 👻{'★'.repeat(m.stars)}</em> : null}</span>
                <span className="mastery-acc" style={{ color: col }}>{m.acc === null ? '—' : `${m.acc}%`}</span>
                <span className="mastery-meta">{m.n > 0 ? `${m.n}문항 · ${Math.round(m.timeSec / 60)}분` : '미시작'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ 탭: 진행 + 로드맵 ═══════════════ */

/** v1.4.21 — 관제실 단어 대륙 패널.
 *  왜 필요한가: v1.4.16~v1.4.20에서 앱에는 어휘 엔진·수호자·골렘·워드몬이 들어왔는데
 *  관제실에는 그 어느 것도 없었다. Dio님이 예한이 상태를 보려면 "모듈 28개"만으로는 안 된다.
 *  티어 이름·수호자 이름은 vocab.json(단일 진실)에서 지연 로드한다 — 관제실에 복사본을 두지 않는다. */
function VocabPanel(props: { M: Metrics }) {
  const { M } = props
  const V = M.vocabStats
  const [data, setData] = useState<VocabData | null>(null)
  useEffect(() => { loadVocab().then(setData).catch(() => {}) }, [])
  const tierName = (t: number) => data?.tiers.find(x => x.tier === t)?.name_ko || `T${t}`
  const guardian = (t: number) => data?.tiers.find(x => x.tier === t)?.guardian

  return (
    <div className="adm-panel">
      <h4>🗺️ 단어 대륙 <span className="adm-sub">GIU Basic + 중학 전 과정 2,400단어</span></h4>
      <div className="adm-stats">
        <div className="adm-stat"><span className="k">정복 구역</span><span className="v">{V.packsDone}/200</span><span className="d flat">단어 {V.words.toLocaleString()}개</span></div>
        <div className="adm-stat"><span className="k">★★★ 구역</span><span className="v">{V.perfect}</span><span className="d flat">90% 이상 정복</span></div>
        <div className="adm-stat"><span className="k">어휘 정답률</span><span className="v">{V.acc === null ? '—' : `${V.acc}%`}</span><span className="d flat">{V.events.toLocaleString()}문항</span></div>
        <div className="adm-stat"><span className="k">⚔️ 단어 골렘</span><span className="v">{V.golems}/40</span><span className="d flat">구역 5개마다 출현</span></div>
        <div className="adm-stat"><span className="k">깨어난 수호자</span><span className="v">{V.guardians}/10</span><span className="d flat">한 구역 20팩 = 1명</span></div>
        <div className="adm-stat"><span className="k">👑 전설 워드몬</span><span className="v">{V.legend}</span><span className="d flat">어휘 카드 {V.caught}장 중 박스5</span></div>
      </div>

      {/* 워드몬 진화 분포 — 어휘 카드만 (모듈 오답 카드는 제외해야 의미가 있다) */}
      <p className="adm-sub" style={{ margin: '12px 0 4px' }}>워드몬 진화 단계 (어휘 카드 {V.caught}장)</p>
      {V.caught === 0 ? <p className="admin-empty">아직 잡은 워드몬이 없어요.</p> : (
        <>
          <div className="box-bar">
            {V.wordmonDist.map((n, i) => n > 0 ? <i key={i} style={{ width: `${(n / Math.max(1, V.caught)) * 100}%`, background: BOX_COLORS[i] }} /> : null)}
          </div>
          <div className="box-legend">
            {V.wordmonDist.map((n, i) => (
              <span key={i}><i style={{ background: BOX_COLORS[i] }} />{EVO_STAGES[i].emoji} {EVO_STAGES[i].name} {n}</span>
            ))}
          </div>
        </>
      )}

      {/* 티어별 진도 + 수호자 각성 + 골렘 */}
      <p className="adm-sub" style={{ margin: '14px 0 4px' }}>구역별 진행</p>
      <div className="adm-weak">
        {V.tierRows.map(r => {
          const g = guardian(r.tier)
          const col = r.done === 20 ? 'var(--success)' : r.done > 0 ? 'var(--info)' : 'var(--wc-surface-border)'
          return (
            <div key={r.tier} className="adm-weak-row">
              <span className="nm" style={{ minWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                T{r.tier} {tierName(r.tier)}{g ? ` ${g.emoji}${AWAKEN_ICON[r.stage]}` : ''}
              </span>
              <span className="bar"><i style={{ width: `${(r.done / 20) * 100}%`, background: col }} /></span>
              <span className="pc" style={{ color: col, minWidth: 116, textAlign: 'right', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                {r.done}/20 · ★{r.perfect} · ⚔️{r.golems}/{r.golemsDue}
              </span>
            </div>
          )
        })}
      </div>
      <p className="adm-sub" style={{ marginTop: 6 }}>
        표기 = 정복 구역 / ★★★ 구역 수 / 격파한 골렘 ÷ 지금까지 나타난 골렘.
        {V.tierRows.some(r => r.golems < r.golemsDue) && ' ⚠️ 안 잡은 골렘이 있어요 — 잡아야 수호자가 다음 단계로 깨어납니다.'}
      </p>

      {/* 어휘 취약 구역 */}
      {V.weakVocab.length > 0 && (
        <>
          <p className="adm-sub" style={{ margin: '14px 0 4px' }}>어휘 취약 구역 (정답률 낮은 순)</p>
          <div className="adm-weak">
            {V.weakVocab.map(w => {
              const col = w.pct < 70 ? 'var(--redstone)' : w.pct < 85 ? 'var(--gold)' : 'var(--success)'
              return (
                <div key={w.id} className="adm-weak-row">
                  <span className="nm">{moduleName(w.id)}</span>
                  <span className="bar"><i style={{ width: `${w.pct}%`, background: col }} /></span>
                  <span className="pc" style={{ color: col }}>{w.pct}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ProgressTab(props: { M: Metrics }) {
  const { M } = props
  /* ★v1.4.35★ 분모는 **아이 화면과 같아야 한다.**
     worlds_ready가 켜진 뒤에도 관제실은 28로 나눠 "100% 완주"라고 적고 있었다.
     같은 시각 예한이 폰은 28/52였다 — 같은 아이를 두고 두 화면이 다른 말을 하고 있었던 것이다. */
  const P = M.prog
  return (
    <div className="adm-screen">
      <VocabPanel M={M} />
      <div className="adm-panel">
        <h4>전체 진행률 <span className="adm-sub">예한이 화면과 같은 분모</span></h4>
        <div className="prog-hero">
          <div className="prog-ring" style={{ background: `conic-gradient(var(--diamond) ${P.pct * 3.6}deg, var(--wc-surface-border) 0)` }}>
            <span>{P.pct}%</span>
          </div>
          <div className="prog-hero-txt">
            <b>{P.done} / {P.total} 모듈</b>
            <span>클리어한 학습 모듈</span>
          </div>
        </div>
        {P.extOpen && (
          <div className="ah-progsplit">
            <div><span>기준 커리큘럼 (월드 1~5)</span><b>{P.baseDone}/{P.baseTotal}</b>
              <i><em style={{ width: `${(P.baseDone / P.baseTotal) * 100}%` }} /></i></div>
            <div><span>확장 커리큘럼 (월드 7~10)</span><b>{P.extDone}/{P.extTotal}</b>
              <i><em style={{ width: `${(P.extDone / P.extTotal) * 100}%` }} /></i></div>
          </div>
        )}
      </div>

      <div className="adm-panel">
        <h4>월드 지도 (현재 커리큘럼)</h4>
        {M.worldProgress.map(w => (
          <div key={w.world} className="road-world">
            <div className="road-world-head">
              <b>{w.emoji} 월드 {w.world} · {w.name}</b>
              <span className="road-count">{w.done}/{w.total}</span>
            </div>
            <div className="road-mods">
              {w.mods.map(m => {
                const cls = m.status === 'completed' || m.status === 'mastered' ? 'done' : m.status === 'in_progress' ? 'doing' : m.status === 'available' ? 'open' : 'locked'
                return <span key={m.id} className={`road-mod ${cls}`}>{m.id}<em>{MODULE_NAMES[m.id] || ''}</em></span>
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ★v1.4.35★ 이 패널은 v1.4.26에 월드 7~10이 실제로 열린 뒤에도 "승인 대기 · 예정"이라고 적고 있었다.
          문구를 손으로 관리하면 반드시 낡는다 → 이제 라이브 스위치(worlds_ready)와 실제 진도에서 상태를 만든다. */}
      <div className="adm-panel">
        <h4>🚀 중학 대비 심화 과정 <span className="adm-sub">{M.prog.extOpen ? '예한이 화면에 열려 있음' : '아직 잠김 (version.json의 worlds_ready)'}</span></h4>
        <div className="road-future">
          {FUTURE_WORLDS.map(w => {
            const wp = M.worldProgress.find(x => x.world === w.world)
            const done = wp?.done ?? 0
            const total = wp?.total ?? 6
            const state = !M.prog.extOpen ? '잠김' : done === 0 ? '미시작' : done === total ? '완료 ✓' : `${done}/${total}`
            return (
              <div key={w.world} className="road-fut">
                <span className="road-fut-em">{w.emoji}</span>
                <div className="road-fut-txt">
                  <b>월드 {w.world} · {w.name}</b>
                  <span>{w.desc}</span>
                </div>
                <span className="road-fut-lock">{state}</span>
              </div>
            )
          })}
        </div>
        <p className="admin-note">
          {M.prog.extOpen
            ? '네 월드 모두 예한이 화면에 이미 떠 있습니다. 위 진행률의 분모(52)에도 들어가 있어요.'
            : '콘텐츠·코드는 배포돼 있고 서버 스위치(worlds_ready) 하나로 열립니다 — 앱 재배포가 필요 없어요.'}
        </p>
      </div>
    </div>
  )
}

/* ═══════════════ 탭: 성취·보상 ═══════════════ */
function RewardsTab(props: {
  M: Metrics; lp: { level: number; cur: number; need: number }
  rewards: RewardRow[]; badges: BadgeRow[]; goals: RewardGoal[]; granting: number | null
  onAdd: (xp: number, title: string, emoji: string, note: string) => Promise<string | null>
  onEdit: (id: number, xp: number, title: string, emoji: string, note: string) => Promise<string | null>
  onRemove: (id: number) => Promise<void>
  onGrant: (g: RewardGoal) => Promise<void>
  onUngrant: (g: RewardGoal) => Promise<void>
}) {
  const { M, lp, rewards, badges, goals } = props
  const totalXp = M.totalXp
  const view = buildRewardView(goals, totalXp)
  // 뱃지: 데이터 계산(earnedBadges) ∪ badges 테이블
  const earnedAt = new Map(badges.map(b => [b.badge_id, b.earned_at]))
  const earnedIds = new Set<string>([...M.earnedBadges, ...badges.map(b => b.badge_id)])

  const [editing, setEditing] = useState<RewardGoal | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [badgeOpen, setBadgeOpen] = useState<Record<string, boolean>>({})   // v1.4.27 뱃지 카테고리 접기/펴기

  // 최근 14일 하루 평균 XP → "이 페이스면 며칠" 추정 (아빠가 기준선을 현실적으로 잡도록 돕는다)
  const paceAvg = M.paceXp.avg
  // 표본 3일 미만이면 예상일을 말하지 않는다 — 근거 없는 숫자는 신뢰를 깎는다.
  const etaOf = (remaining: number) => (paceAvg > 0 && M.paceXp.days >= 3 && remaining > 0 ? Math.ceil(remaining / paceAvg) : null)

  return (
    <div className="adm-screen">
      <div className="adm-reward-hero">
        <div className="adm-reward-total">
          <span className="k">누적 총 XP</span>
          <span className="v">{totalXp.toLocaleString()}</span>
          <span className="lv">LV.{lp.level} · {levelTitle(lp.level)}</span>
        </div>
        <div className="adm-reward-mini">
          <div className="m"><b>+{M.todayXp}</b><span>오늘 XP</span></div>
          <div className="m"><b>+{M.weekXp}</b><span>이번 주 XP</span></div>
        </div>
      </div>

      {/* ── v1.4.22 보상 로드맵 ─────────────────────────────────
          아빠가 XP 기준과 보상 이름을 직접 적는다. 적는 즉시 예한이 앱(🎁 보상 창고 + 월드맵 상단)에 뜬다. */}
      <div className="adm-panel">
        <h4>🎁 보상 로드맵 <span className="adm-sub">{view.reachedCount}/{goals.length} 달성 · 최대 {MAX_GOALS}개</span></h4>

        {view.pending.length > 0 && (
          <div style={{ background: '#3a2a06', border: '1px solid #ffd050', borderRadius: 10, padding: '9px 11px', margin: '8px 0 4px', color: '#fff6dd', fontSize: 13 }}>
            🎉 <b>{view.pending.map(p => p.goal.title).join(', ')}</b> — 예한이가 기준선을 넘었어요. 지급하면 아이 화면에 🏆로 바뀝니다.
          </div>
        )}

        {goals.length === 0 && !adding && (
          <p className="admin-note">
            아직 등록된 보상이 없어요. 예한이 앱에는 “아빠가 보상을 정하는 중이야!”로 보입니다.
            <br />기준 XP와 보상 이름을 적으면 바로 아이 화면에 뜹니다. (지금 페이스: 하루 평균 {paceAvg.toLocaleString()} XP)
          </p>
        )}

        {view.steps.map(st => {
          const g = st.goal
          if (editing?.id === g.id) {
            return <GoalForm key={g.id} initial={g} paceAvg={paceAvg} totalXp={totalXp}
              onCancel={() => setEditing(null)}
              onSubmit={async (xp, title, emoji, note) => {
                const err = await props.onEdit(g.id, xp, title, emoji, note)
                if (!err) setEditing(null)
                return err
              }} />
          }
          const eta = etaOf(st.remaining)
          return (
            <div key={g.id} style={{
              border: `1px solid ${st.granted ? '#2f7d52' : st.reached ? '#c9a227' : '#21324a'}`,
              background: st.granted ? '#0e2318' : st.reached ? '#241c06' : '#0f1a28',
              borderRadius: 12, padding: '10px 11px', margin: '8px 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{g.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{g.title}</b>
                  <div className="adm-sub" style={{ marginTop: 2 }}>
                    {g.threshold_xp.toLocaleString()} XP
                    {!st.reached && <> · 남은 {st.remaining.toLocaleString()} XP{eta ? ` · 이 페이스면 약 ${eta}일` : ''}</>}
                    {st.granted && ` · 지급 완료 ${new Date(g.granted_at!).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })}`}
                  </div>
                </div>
                {st.granted
                  ? <button className="btn ghost" style={tinyBtn} onClick={() => void props.onUngrant(g)}>지급 취소</button>
                  : st.reached
                    ? <button className="mgbtn" disabled={props.granting === g.id} onClick={() => void props.onGrant(g)}>
                        {props.granting === g.id ? '처리 중…' : '지급함 ✓'}
                      </button>
                    : <span className="adm-sub" style={{ whiteSpace: 'nowrap' }}>{st.pct}%</span>}
              </div>
              {!st.reached && (
                <div style={{ height: 6, background: 'rgba(0,0,0,.35)', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ width: `${Math.max(st.pct, 2)}%`, height: '100%', borderRadius: 99, background: '#4a9eff' }} />
                </div>
              )}
              {g.note && <p className="admin-note" style={{ margin: '7px 0 0' }}>{g.note}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn ghost" style={tinyBtn} onClick={() => { setEditing(g); setAdding(false) }}>수정</button>
                {confirmDel === g.id
                  ? <>
                      <button className="btn ghost" style={{ ...tinyBtn, color: '#ff8a9a' }} onClick={() => { void props.onRemove(g.id); setConfirmDel(null) }}>진짜 삭제</button>
                      <button className="btn ghost" style={tinyBtn} onClick={() => setConfirmDel(null)}>취소</button>
                    </>
                  : <button className="btn ghost" style={tinyBtn} onClick={() => setConfirmDel(g.id)}>삭제</button>}
              </div>
            </div>
          )
        })}

        {adding
          ? <GoalForm paceAvg={paceAvg} totalXp={totalXp} onCancel={() => setAdding(false)}
              onSubmit={async (xp, title, emoji, note) => {
                const err = await props.onAdd(xp, title, emoji, note)
                if (!err) setAdding(false)
                return err
              }} />
          : goals.length < MAX_GOALS && (
            <button className="btn primary wide" style={{ marginTop: 8 }} onClick={() => { setAdding(true); setEditing(null) }}>
              ＋ 보상 추가하기
            </button>
          )}

        <p className="admin-note" style={{ marginTop: 10 }}>
          팁 — 첫 보상은 <b>1~2주 안에 닿는 거리</b>로 잡으면 좋습니다(가까운 목표가 멀리 있는 큰 목표보다 실제로 더 세게 당깁니다).
          지금 페이스로는 하루 평균 {paceAvg.toLocaleString()} XP예요.
        </p>
      </div>

      {rewards.length > 0 && (
        <div className="adm-panel">
          <h4>지급 이력 <span className="adm-sub">{rewards.length}건</span></h4>
          <div className="adm-mile-list">
            {rewards.slice(0, 20).map(r => (
              <div key={r.id} className="adm-mile-row done">
                <span className="mx">🏅 {r.note || `${r.milestone_xp.toLocaleString()} XP 마일스톤`}</span>
                <span className="mg">{new Date(r.granted_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
          <p className="admin-note">예전 방식(1,000 XP마다 자동 마일스톤)으로 지급한 기록도 여기에 그대로 남아 있습니다.</p>
        </div>
      )}

      <div className="adm-panel">
        <h4>뱃지 도감 <span className="adm-sub">{earnedIds.size}/{Object.keys(BADGE_DEFS).length}</span></h4>
        {/* v1.4.27 — 59개로 늘어 접기/펴기. 기본은 하나라도 딴 카테고리만 펼친다(아이 앱과 동일 규칙). */}
        {BADGE_GROUPS.map(g => {
          const ids = Object.entries(BADGE_DEFS).filter(([, b]) => b.group === g)
          if (!ids.length) return null
          const n = ids.filter(([id]) => earnedIds.has(id)).length
          const open = badgeOpen[g] ?? n > 0
          return (
            <div key={g}>
              <button className="adm-sub" onClick={() => setBadgeOpen({ ...badgeOpen, [g]: !open })}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', margin: '10px 0 4px', padding: '4px 0' }}>
                <span>{GROUP_EMOJI[g]} {g} — {n}/{ids.length}</span>
                <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
              </button>
              {open && <div className="rw-badges">
                {ids.map(([id, b]) => {
                  const got = earnedIds.has(id)
                  const when = earnedAt.get(id)
                  return (
                    <div key={id} className={`rw-badge ${got ? 'got' : 'off'}`}>
                      <span className="rw-badge-em">{got ? b.emoji : '🔒'}</span>
                      <b>{b.name}</b>
                      <span className="rw-badge-desc">{got ? b.desc : `조건: ${b.hint}`}</span>
                      {got && when && <span className="rw-badge-when">{new Date(when).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })}</span>}
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const tinyBtn = { padding: '4px 10px', fontSize: 12 } as const

/** 보상 목표 입력 폼 — 추가/수정 공용 */
function GoalForm(props: {
  initial?: RewardGoal
  paceAvg: number
  totalXp: number
  onCancel: () => void
  onSubmit: (xp: number, title: string, emoji: string, note: string) => Promise<string | null>
}) {
  const [xp, setXp] = useState(String(props.initial?.threshold_xp ?? ''))
  const [title, setTitle] = useState(props.initial?.title ?? '')
  const [emoji, setEmoji] = useState(props.initial?.emoji ?? '🎁')
  const [note, setNote] = useState(props.initial?.note ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const n = Number(xp)
  const remaining = Number.isFinite(n) ? Math.max(0, n - props.totalXp) : 0
  const eta = props.paceAvg > 0 && remaining > 0 ? Math.ceil(remaining / props.paceAvg) : null

  return (
    <div style={{ border: '1px solid #4a9eff', background: '#0d1c30', borderRadius: 12, padding: 12, margin: '8px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 9 }}>
        {REWARD_EMOJIS.map(e => (
          <button key={e} onClick={() => setEmoji(e)} style={{
            fontSize: 19, lineHeight: 1, padding: '5px 6px', borderRadius: 9, cursor: 'pointer',
            background: emoji === e ? '#1d4a7a' : '#12203180', border: `1px solid ${emoji === e ? '#4a9eff' : '#21324a'}`,
          }}>{e}</button>
        ))}
      </div>
      <label className="adm-sub" style={{ display: 'block', marginBottom: 3 }}>보상 이름 (예한이 화면에 그대로 뜹니다)</label>
      <input value={title} onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
        placeholder="예: 치킨 파티 / 레고 세트 / 영화관 가기" maxLength={60}
        style={inputStyle} />
      <label className="adm-sub" style={{ display: 'block', margin: '9px 0 3px' }}>기준 XP (이 XP에 도달하면 달성)</label>
      <input value={xp} inputMode="numeric" onChange={(e: { target: { value: string } }) => setXp(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="예: 3000" style={inputStyle} />
      {Number.isFinite(n) && n > 0 && (
        <p className="admin-note" style={{ margin: '5px 0 0' }}>
          현재 {props.totalXp.toLocaleString()} XP → 남은 {remaining.toLocaleString()} XP
          {eta ? ` · 지금 페이스면 약 ${eta}일` : ''}
        </p>
      )}
      <label className="adm-sub" style={{ display: 'block', margin: '9px 0 3px' }}>메모 (선택 — 아이에게도 보입니다)</label>
      <input value={note} onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
        placeholder="예: 아빠랑 같이 시켜 먹기!" maxLength={80} style={inputStyle} />

      {err && <p style={{ color: '#ff8a9a', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true)
          const e = await props.onSubmit(Number(xp), title, emoji, note)
          setErr(e); setBusy(false)
        }}>{busy ? '저장 중…' : props.initial ? '수정 저장' : '보상 추가'}</button>
        <button className="btn ghost" onClick={props.onCancel}>취소</button>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const, background: '#0a1420', color: '#eaf1fa',
  border: '1px solid #21324a', borderRadius: 9, padding: '9px 10px', fontSize: 14, font: 'inherit',
}

/* ═══════════════ 문제 다시보기 (오답 필터 추가) ═══════════════ */
function ProblemViewer(props: { learnerId: string; baseEvents: AnswerEvent[]; onClose: () => void }) {
  const [events, setEvents] = useState<AnswerEvent[]>(props.baseEvents)
  const [loading, setLoading] = useState(true)
  const [dateKey, setDateKey] = useState('')
  const [idx, setIdx] = useState(0)
  const [wrongOnly, setWrongOnly] = useState(false)

  const todayKey = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  const yKey = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }) })()

  useEffect(() => {
    let alive = true
    const d30 = new Date(); d30.setDate(d30.getDate() - 89)
    const since = encodeURIComponent(`${d30.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })}T00:00:00+09:00`)
    /* ★★v1.4.40 — 이 한 줄이 "문제 다시보기"를 통째로 망가뜨리고 있었다★★
       2026-08-16 라이브 실측: 날짜 드롭다운에 **7/15·7/16·7/17 세 날짜만** 떴고,
       기본 선택된 7/17은 "이 날짜에는 푼 문제가 없어요"라고 답했다(실제로는 167문항).
       원인 두 겹:
         ① `db.select`(limit=6000)는 서버 `Max rows` 1,000에서 잘린다. `order=asc`라 **가장 오래된 1,000건**만 왔다
            (7/15 155 + 7/16 749 + 7/17 167 = 1,071 — 딱 그 경계다). v1.4.38이 고친 것을
            같은 화면의 다른 컴포넌트가 되돌리고 있었다.
         ② 그 잘린 배열이 `refresh()`가 selectAll로 받아 둔 4,432건을 **덮어썼고**,
            먼저 정해진 `dateKey`(오늘)는 새 목록에 없어서 화면이 빈 상태가 됐다.
       → selectAll로 받고, 목록이 바뀌면 선택 날짜를 다시 맞춘다. */
    db.selectAll('answer_events', `learner_id=eq.${props.learnerId}&created_at=gte.${since}&order=created_at.asc`)
      .then(r => { if (alive && r.rows.length) setEvents(r.rows as unknown as AnswerEvent[]) })
      .catch(() => { /* baseEvents 유지 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [props.learnerId])

  const availDates = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(kstDate(e.created_at))
    return Array.from(set).sort().reverse()
  }, [events])

  useEffect(() => {
    if (!availDates.length) return
    // 선택한 날짜가 목록에 **없으면** 반드시 다시 맞춘다 — 없으면 "푼 문제가 없어요"만 남는다.
    if (dateKey && availDates.includes(dateKey)) return
    setDateKey(availDates.includes(todayKey) ? todayKey : availDates[0])
  }, [availDates, dateKey, todayKey])

  const problems = useMemo(() =>
    events.filter(e => kstDate(e.created_at) === dateKey && (!wrongOnly || !e.is_correct)).slice().sort((a, b) => a.created_at < b.created_at ? -1 : 1)
  , [events, dateKey, wrongOnly])

  useEffect(() => { setIdx(0) }, [dateKey, wrongOnly])

  const kb = useRef({ len: 0, onClose: props.onClose })
  kb.current = { len: problems.length, onClose: props.onClose }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') kb.current.onClose()
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(kb.current.len - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cur = problems[idx]
  return (
    <div className="pv-overlay" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="pv-sheet" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="pv-head">
          <span className="pv-title">📄 문제 다시보기</span>
          {availDates.length > 0 && (
            <select className="pv-date" value={dateKey} onChange={(e: { target: { value: string } }) => setDateKey(e.target.value)}>
              {availDates.map(d => <option key={d} value={d}>{dateLabel(d, todayKey, yKey)}</option>)}
            </select>
          )}
          <button className={`pv-wrong ${wrongOnly ? 'on' : ''}`} onClick={() => setWrongOnly(v => !v)}>{wrongOnly ? '오답만 ✓' : '오답만'}</button>
          <button className="pv-close" onClick={props.onClose} aria-label="닫기">✕</button>
        </div>

        {loading && !problems.length ? (
          <div className="pv-empty">불러오는 중…</div>
        ) : !cur ? (
          // v1.4.40 — 빈 상태에 '왜 비었는지'와 '무엇을 하면 되는지'를 같이 준다.
          //   예전엔 조회가 1,000행에서 잘려 목록에 없는 날짜가 선택돼도 이 문장만 떴다 — 아빠는 원인을 알 길이 없었다.
          <div className="pv-empty">
            {wrongOnly
              ? '이 날짜엔 오답이 없어요 — 굿! 🎉'
              : availDates.length === 0
                ? '아직 기록이 없어요. 예한이가 한 판 하면 여기에 문제가 그대로 남습니다.'
                : `이 날짜에는 푼 문제가 없어요. 위 날짜 목록에서 다른 날(기록 있는 날 ${availDates.length}일)을 골라 보세요.`}
          </div>
        ) : (
          <>
            <div className="pv-body">
              <div className="pv-meta">
                <time>{kstClock(cur.created_at)}</time>
                <span className="pv-mod">[{feedTag(cur)}]</span>
                {cur.is_correct ? <span className="pv-badge o">정답 ✓</span> : <span className="pv-badge x">오답 ✕</span>}
              </div>
              <div className={`pv-q ${cur.is_correct ? '' : 'wrong'}`}>{cur.question_text || cur.question_id}</div>
              <div className="pv-ans-row">
                <div className={`pv-ans ${cur.is_correct ? 'ok' : 'no'}`}>
                  <span className="lbl">예한이 답</span>
                  <b>{cur.given_answer ?? '—'}</b>
                </div>
                {!cur.is_correct && (
                  <div className="pv-ans ok">
                    <span className="lbl">정답</span>
                    <b>{cur.correct_answer ?? '—'}</b>
                  </div>
                )}
              </div>
              {cur.response_ms != null && <p className="pv-rt">걸린 시간 {(cur.response_ms / 1000).toFixed(1)}초</p>}
            </div>

            {/* v1.4.35 — 하루 1,000문항인 날이 실제로 있다(8/14: 1,179문항). 점을 전부 그리면
                화면이 점으로 뒤덮여 아무것도 못 고른다 → 현재 위치 주변 60개만 그린다. */}
            <div className="pv-dots">
              {(() => {
                const W = 60
                const start = Math.max(0, Math.min(idx - Math.floor(W / 2), problems.length - W))
                const from = Math.max(0, start)
                const slice = problems.slice(from, from + W)
                return <>
                  {from > 0 && <span className="pv-dots-more">…{from}</span>}
                  {slice.map((p, i) => (
                    <button key={p.id} className={`pv-dot ${p.is_correct ? 'o' : 'x'} ${from + i === idx ? 'cur' : ''}`}
                      onClick={() => setIdx(from + i)} aria-label={`${from + i + 1}번 ${p.is_correct ? '정답' : '오답'}`} />
                  ))}
                  {from + W < problems.length && <span className="pv-dots-more">{problems.length - from - W}…</span>}
                </>
              })()}
            </div>
            <div className="pv-nav">
              <button className="pv-navbtn" disabled={idx <= 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>◂ 이전</button>
              <span className="pv-count">{idx + 1} / {problems.length}</span>
              <button className="pv-navbtn" disabled={idx >= problems.length - 1} onClick={() => setIdx(i => Math.min(problems.length - 1, i + 1))}>다음 ▸</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ 순수 SVG 추이 차트 ═══════════════ */
function TrendChart(props: { days: { dow: string; acc: number | null }[] }) {
  const pts = props.days.map((d, i) => d.acc === null ? null : { x: 34 + i * 44, y: Math.min(114, 18 + (100 - d.acc) * 1.6), acc: d.acc })
  const segs: string[] = []
  let cur: string[] = []
  for (const p of pts) { if (p) cur.push(`${p.x},${p.y}`); else { if (cur.length > 1) segs.push(cur.join(' ')); cur = [] } }
  if (cur.length > 1) segs.push(cur.join(' '))
  const today = pts[6]
  return (
    <svg viewBox="0 0 320 130" role="img" aria-label="최근 7일 정답률 추이">
      <line x1="8" y1="18" x2="312" y2="18" style={{ stroke: 'var(--wc-surface-border)', strokeWidth: 1 }} strokeDasharray="3 3" />
      <line x1="8" y1="58" x2="312" y2="58" style={{ stroke: 'var(--wc-surface-border)', strokeWidth: 1 }} strokeDasharray="3 3" />
      <line x1="8" y1="98" x2="312" y2="98" style={{ stroke: 'var(--wc-surface-border)', strokeWidth: 1 }} strokeDasharray="3 3" />
      <text x="8" y="14" style={{ fill: 'var(--text-2)', fontSize: 9 }}>100%</text>
      <text x="8" y="54" style={{ fill: 'var(--text-2)', fontSize: 9 }}>75%</text>
      <text x="8" y="94" style={{ fill: 'var(--text-2)', fontSize: 9 }}>50%</text>
      {segs.map((s, i) => <polyline key={i} points={s} style={{ fill: 'none', stroke: 'var(--diamond)', strokeWidth: 2 }} />)}
      {pts.map((p, i) => p && i < 6 ? <circle key={i} cx={p.x} cy={p.y} r={3.5} style={{ fill: 'var(--diamond)' }} /> : null)}
      {today && <>
        <circle cx={today.x} cy={today.y} r={5} style={{ fill: 'var(--gold)' }} />
        <text x={today.x} y={today.y - 13} textAnchor="middle" style={{ fill: 'var(--gold)', fontSize: 10, fontWeight: 700 }}>{today.acc}%</text>
      </>}
      {props.days.map((d, i) => <text key={i} x={34 + i * 44} y="122" textAnchor="middle" style={{ fill: 'var(--text-2)', fontSize: 9 }}>{d.dow}</text>)}
    </svg>
  )
}

/* ═══════════════ 헬퍼 ═══════════════ */
function feedTag(e: AnswerEvent): string {
  if (e.activity_type === 'review') return '복습'
  if (e.activity_type === 'ghost') return '👻유령' // v1.3.0
  if (e.activity_type === 'forge' || e.activity_type === 'forge_discover') return '🔮소환진' // v1.4.0
  if (e.activity_type === 'vocab') return isVocabGolemId(e.module_id) ? `⚔️골렘 ${e.module_id}` : `🗺️단어 ${e.module_id}`
  if (e.activity_type === 'game_listen_choice') return moduleName(e.module_id) || '듣기'
  if (e.activity_type === 'diagnostic') return '진단'
  return moduleName(e.module_id) || typeLabel(e.activity_type)
}
function typeLabel(t: string): string {
  const map: Record<string, string> = {
    quiz: '퀴즈', boss: '보스전', ghost: '👻유령전', diagnostic: '진단', speak: '말하기',
    game_choice: '게임', game_listen_choice: '듣기게임', game_match: '짝맞추기', game_order: '조립게임', review: '복습',
    forge: '소환진', forge_discover: '문장 발견', vocab: '🗺️단어 대륙',
  }
  return map[t] || t
}
