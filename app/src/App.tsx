import { useCallback, useEffect, useState } from 'react'
import { WorldMap } from './screens/WorldMap'
import { ModuleSession } from './screens/ModuleSession'
import { DiagnosticRun } from './screens/DiagnosticRun'
import { ReviewMine } from './screens/ReviewMine'
import { Profile } from './screens/Profile'
import { AdminPage } from './screens/AdminPage'
import { AppInfo } from './screens/AppInfo'
import { Splash } from './screens/Splash'
import { GhostBattle } from './screens/GhostBattle'
import { ListenArcade } from './screens/ListenArcade'
import { RuneDex } from './screens/RuneDex'
import { Connect } from './screens/Connect'
import { FamilyDashboard } from './screens/FamilyDashboard'
import { SuperConsole } from './screens/SuperConsole'
import { VocabContinent, type VocabResult } from './screens/VocabContinent'
import { WordDex } from './screens/WordDex'
import { RewardBoard, useRewardGoals } from './screens/RewardBoard'
import {
  loadLocal, saveLocal, initLearner, startSession, endSession, heartbeatSession, resumeSession, repairStreak, syncSharedDaily,
  recordAnswer, recordXp, recordProgress, recordGhostResult, recordBadge,
  bumpSortPerfect, setRapidBest, enqueue, type LocalState,
} from './lib/store'
import { XP } from './lib/xp'
import { db, consumeAuthRedirect, getAuthUser, myDeviceLearner, ensureAnonSession, bindLegacyDevice, authKind, type Learner } from './lib/supabase'
import { DIAG_ORDER, moduleOrder, loadModule } from './lib/content'
import { computeEarnedBadges } from './lib/badges'
import { reviewCardsFor, type VocabQuestion } from './lib/vocab'
import { todayStr, kstTomorrowStr } from './lib/leitner'
// v1.4.29: 하단 네비 뱃지와 복습 광산이 **같은 규칙**을 쓰도록 (숫자 불일치 사고 재발 방지)
import { dueCardsQuery, minableCards } from './lib/review'
import { APP_VERSION, isNewer, type VersionInfo } from './lib/version'
import type { StepEvent } from './engine/StepRunner'

// 오답 → 복습 카드로 들어가는 활동 유형 (진단·짝맞추기·말하기 제외 — "월드에서 틀린 모든 문제" 원칙)
// v1.3.0: 유령 보스('ghost')도 리스폰 대상 (CONTRACT v1.3 §8)
consumeAuthRedirect() // v2: 구글 로그인 콜백(#access_token=...)을 라우팅 전에 처리

const WRONG_TO_REVIEW = new Set(['quiz', 'boss', 'ghost', 'game_choice', 'game_listen_choice', 'game_order'])

function useHashRoute(): [string, (h: string) => void] {
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, '') || '/')
  useEffect(() => {
    const on = () => setRoute(location.hash.replace(/^#/, '') || '/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [route, (h: string) => { location.hash = h }]
}

type AuthRole = 'loading' | 'guardian' | 'device' | 'legacy'

export default function App() {
  const [route, nav] = useHashRoute()
  const [state, setState] = useState<LocalState>(() => loadLocal())
  // v2 다가구: 인증 상태별 라우팅. guardian=보호자(구글)·device=아이기기(익명)·legacy=세션無(예한 하위호환)
  const [authRole, setAuthRole] = useState<AuthRole>('loading')
  const [dueCount, setDueCount] = useState(0)
  const [backsMap, setBacksMap] = useState<Record<string, { back: string; tts?: string | null }>>({})
  // v1.4.22 보상 로드맵 — 한 번만 읽어 월드맵 스트립·보상 창고가 같은 데이터를 쓴다.
  const { goals: rewardGoals } = useRewardGoals(state.learnerId)
  // 달성했는데 아직 아빠가 지급 안 한 보상 수 → 하단 네비 뱃지 (아이가 놓치지 않도록)
  const rewardAlert = rewardGoals.filter(g => !g.granted_at && state.xp >= g.threshold_xp).length
  // 스플래시 — 접속 화면에 따라 learner/admin 2종, 매 실행 1회
  const [splash, setSplash] = useState(true)
  const [splashVariant] = useState<'learner' | 'admin'>(() =>
    (location.hash.replace(/^#/, '') || '/').startsWith('/admin') ? 'admin' : 'learner')
  // 원격 업데이트 체크 — 서버 /version.json vs APP_VERSION
  const [latest, setLatest] = useState<VersionInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [rechecking, setRechecking] = useState(false)
  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) setLatest(await res.json() as VersionInfo)
    } catch { /* 오프라인 — 확인 불가 표시 */ }
    setChecking(false)
    setRechecking(false)
  }, [])
  useEffect(() => { void checkVersion() }, [checkVersion])
  const updateAvailable = !!latest && isNewer(latest.version, APP_VERSION)

  // 뱃지 동기화 — 현재 상태로 획득 가능한 뱃지를 전부 판정해 놓친 것 소급 지급 (upsert라 중복 무해)
  const sessionRecorded = useState(() => new Set<string>())[0]
  const syncBadges = useCallback((s: LocalState) => {
    for (const id of computeEarnedBadges(s)) {
      if (sessionRecorded.has(id)) continue
      sessionRecorded.add(id)
      recordBadge(s, id)
    }
  }, [sessionRecorded])

  // ★v1.4.29★ 뱃지 숫자 = 복습 광산이 실제로 보여줄 카드 수. 같은 쿼리·같은 필터를 쓴다.
  //   (2026-08-14 사고: 뱃지는 서버 due를 세고 광산은 500장 창에서 골라 40 vs 0으로 갈렸다)
  const refreshDueCount = useCallback((learnerId: string | null) => {
    if (!learnerId) return
    db.select('review_cards', dueCardsQuery(learnerId))
      .then(rows => setDueCount(minableCards(rows as unknown as { card_id: string; due_date: string }[]).length))
      .catch(() => {})
  }, [])

  // ── v1.4.16 단어 대륙 기록 ──────────────────────────────────
  // 문항 1개 = answer_events 1행(activity_type='vocab'), 정답이면 XP.vocabCorrect.
  // 오답은 감점 없음(리스폰) — 팩을 끝내면 어차피 12단어 전부 복습 카드로 들어간다.
  const onVocabAnswer = useCallback((packId: string, q: VocabQuestion, ok: boolean, ms: number) => {
    setState(prev => {
      recordAnswer(prev, {
        module_id: packId, activity_type: 'vocab', question_id: q.id,
        question_text: `[${q.mode}] ${q.prompt}`.slice(0, 300),
        correct_answer: q.answer, is_correct: ok, response_ms: ms,
      })
      return ok ? recordXp(prev, XP.vocabCorrect, 'vocab_correct', packId) : prev
    })
  }, [])

  // v1.4.20 단어 골렘 격파 — 팩 5개마다 나타나는 보스. 실패가 없는 구조라 '격파'만 기록된다.
  // module_id = 'GOLEM-T<티어>-<번호>' (L17 additive: 새 테이블·컬럼 0, 기존 module_progress 재사용)
  const onVocabGolemDone = useCallback((golemModuleId: string, firstTryPct: number) => {
    setState(prev => {
      let s = recordProgress(prev, golemModuleId, { status: 'completed', best_score: firstTryPct, completed: true })
      s = recordXp(s, XP.vocabGolem, 'vocab_golem', golemModuleId)
      syncBadges(s)
      return s
    })
  }, [syncBadges])

  // v1.4.21 뱃지 카운터 — 분류 상자 만점 / 속사 사냥 최고 기록.
  // 둘 다 서버 이벤트로 되짚을 수 없어(속사는 의도적 미기록) 로컬에 쌓고, 뱃지 획득은 badges 테이블에 남는다.
  const onSortPerfect = useCallback(() => { setState(prev => { const s = bumpSortPerfect(prev); syncBadges(s); return s }) }, [syncBadges])
  const onRapidResult = useCallback((hit: number) => { setState(prev => { const s = setRapidBest(prev, hit); syncBadges(s); return s }) }, [syncBadges])

  const onVocabPackDone = useCallback((r: VocabResult) => {
    setState(prev => {
      let s = recordProgress(prev, r.packId, { status: 'completed', best_score: r.pct, completed: true })
      s = recordXp(s, XP.vocabPack, 'vocab_pack', r.packId)
      if (r.stars >= 3) s = recordXp(s, XP.vocabPerfect, 'vocab_perfect', r.packId)
      // 12단어를 라이트너 복습 카드로 시드 (이미 알던 단어는 박스 3부터 — 불필요한 반복 방지)
      if (s.learnerId) {
        const cards = reviewCardsFor(r.pack, r.known)
        setBacksMap(m => {
          const nx = { ...m }
          for (const c of cards) nx[c.card_id] = { back: c.card_back, tts: c.tts }
          return nx
        })
        enqueue({
          kind: 'upsert', table: 'review_cards', conflict: 'learner_id,card_id', ignore: true,
          payload: cards.map(c => ({
            learner_id: s.learnerId, card_id: c.card_id, card_front: c.card_front,
            card_back: c.card_back, box: c.box, due_date: kstTomorrowStr(),
          })),
        })
      }
      syncBadges(s)
      return s
    })
    refreshDueCount(state.learnerId)
  }, [refreshDueCount, state.learnerId, syncBadges])

  // 초기화: 인증 상태 판별 → (보호자면 가족 대시보드) → 서버 병합 → 세션 시작 + 사용시간 기록(하트비트)
  useEffect(() => {
    // 관제실(PIN)·슈퍼관리실은 학습 세션을 만들지 않는다. 단 세션(인증)은 확보해야 RLS 격리 후에도 읽는다.
    const isAdminRoute = location.hash.replace(/^#/, '').startsWith('/admin')
    const isSuperRoute = location.hash.replace(/^#/, '').startsWith('/super')
    let mounted = true
    let isLearnerDevice = true // 보호자·관제실·슈퍼면 false — 하트비트가 아이 세션을 건드리지 않도록 (아래 가드)
    ;(async () => {
      // v2 다가구: 인증 상태 판별 (세션 없음=legacy 예한 하위호환 / 익명=아이기기 device / 그 외=보호자 guardian)
      let user = await getAuthUser().catch(() => null)
      // Phase 3(무중단 이관): 세션 없는 레거시 기기(로컬 learnerId 보유=예한 기존 기기)는
      // 자동 익명 로그인 + 그 learner에 device 바인딩 → RLS 격리 후에도 자기 데이터 접근 유지.
      // ※ 슈퍼관리실(/super)은 소유자 구글 로그인이 필요하므로 자동 device 바인딩을 하지 않는다.
      // ★L23★ 보호자(구글) 기기는 세션이 잠깐 끊겨도 익명 아이 기기로 강등하지 않는다.
      //  강등되면 부모가 남의 아이 데이터에 device로 묶이고, 익명 계정이 계속 늘어난다.
      const wasGuardian = authKind() === 'guardian'
      if (!user && state.learnerId && !isSuperRoute && !wasGuardian) {
        try {
          await ensureAnonSession() // 살아있는 세션이 있으면 재사용 — 매 실행 새 계정 생성 금지
          await bindLegacyDevice(state.learnerId)
          user = await getAuthUser().catch(() => null)
        } catch { /* 바인딩 실패 — 레거시 폴백 */ }
      }
      // 보호자 기기인데 세션이 죽었으면 학습자 앱으로 떨어뜨리지 말고 가족 화면(재로그인)으로 보낸다.
      if (!user && wasGuardian) {
        if (!mounted) return
        setAuthRole('guardian'); isLearnerDevice = false
        if (!location.hash.replace(/^#/, '').startsWith('/family')) nav('/family')
        return
      }
      const role: AuthRole = !user ? 'legacy' : (user.is_anonymous ? 'device' : 'guardian')
      if (!mounted) return
      setAuthRole(role)
      // 관제실·슈퍼관리실: 세션만 확보, 학습 세션·하트비트 미생성. 화면이 자체 인증/권한 처리.
      if (isAdminRoute || isSuperRoute) { isLearnerDevice = false; return }
      if (role === 'guardian') {
        // 보호자 → 가족 대시보드로. 단 슈퍼 로그인 복귀면 슈퍼관리실로.
        isLearnerDevice = false
        let after: string | null = null
        try { after = localStorage.getItem('wc_after_login') } catch { /* */ }
        if (after === 'super') { try { localStorage.removeItem('wc_after_login') } catch { /* */ } nav('/super'); return }
        if (!location.hash.replace(/^#/, '').startsWith('/family')) nav('/family')
        return
      }
      // device면 이 기기에 바인딩된 아이, 아니면 레거시(FAMILY_CODE=예한 — 기존 흐름 그대로)
      const bound: Learner | null = role === 'device' ? await myDeviceLearner(user!.id) : null
      let s = await initLearner(state, bound ?? undefined)
      s = await syncSharedDaily(s) // v1.4.3 공유 밸런스: 서버 파생 병합(새 기기에도 게이지·출석 정확)
      s = repairStreak(s) // 과거 UTC '어제' 버그로 낮게 저장된 스트릭을 출석 이력으로 자가 복구 (7/16)
      s = await startSession(s)
      // 보스전 승리 이력 서버 복원 (boss_slayer 뱃지 정확 판정 — 로컬 초기화에도 안전)
      if (s.learnerId) {
        try {
          const rows = await db.select('answer_events', `learner_id=eq.${s.learnerId}&activity_type=eq.boss&is_correct=eq.true&select=module_id&order=created_at.desc&limit=2000`)
          const wins = Array.from(new Set([...(s.bossWins || []), ...(rows as { module_id: string }[]).map(r => r.module_id)]))
          s = { ...s, bossWins: wins }
          saveLocal(s)
        } catch { /* 오프라인 — 로컬 값 유지 */ }
      }
      if (mounted) setState(s)
      syncBadges(s) // 시작 시 소급 지급 (풀 스캔 등 유실 뱃지 복구)
      refreshDueCount(s.learnerId)
    })()
    // 사용시간: 모바일 WebView는 pagehide가 거의 안 떠서 하트비트(30초) + 백그라운드 전환 시 확정 기록
    // 하트비트가 출석(하루 15분)을 새로 인정하면 스트릭·출석만 화면 상태에 병합 (다른 필드는 클로버링 방지)
    const hb = window.setInterval(() => {
      if (!isLearnerDevice) return
      const ns = heartbeatSession()
      if (ns) setState(prev => ({ ...prev, streak_days: ns.streak_days, last_active_date: ns.last_active_date, attendance: ns.attendance }))
    }, 30000)
    const onEnd = () => { if (isLearnerDevice) endSession() }
    const onVis = () => { if (!isLearnerDevice) return; if (document.hidden) endSession(); else resumeSession() }
    window.addEventListener('pagehide', onEnd)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      mounted = false
      clearInterval(hb)
      window.removeEventListener('pagehide', onEnd)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // 복습 카드 뒷면 맵 (콘텐츠에서 수집)
  const worldsReady = !!latest?.worlds_ready
  useEffect(() => {
    moduleOrder(worldsReady).forEach(id => {
      loadModule(id).then(m => {
        setBacksMap(prev => {
          const nx = { ...prev }
          for (const c of m.review_cards || []) nx[c.card_id] = { back: c.back, tts: c.tts }
          return nx
        })
      }).catch(() => {})
    })
  }, [worldsReady])

  // ── 이벤트 핸들러 ──
  function onModuleEvent(moduleId: string) {
    return (e: StepEvent) => {
      recordAnswer(state, {
        module_id: moduleId, activity_type: e.activity_type, question_id: e.question_id,
        question_text: e.question_text, given_answer: e.given_answer, correct_answer: e.correct_answer,
        is_correct: e.is_correct, response_ms: e.response_ms,
      })
      setState(prev => {
        let s = prev
        // 오답 → 즉시 복습 광산에 리스폰 (박스1, 오늘부터 due — "틀린 모든 문제는 복습으로")
        if (!e.is_correct && WRONG_TO_REVIEW.has(e.activity_type) && s.learnerId) {
          enqueue({
            kind: 'upsert', table: 'review_cards', conflict: 'learner_id,card_id',
            payload: {
              learner_id: s.learnerId, card_id: `W:${moduleId}:${e.question_id}`,
              card_front: e.question_text || e.question_id,
              card_back: e.correct_answer || '(모듈에서 다시 확인해보자!)',
              box: 1, due_date: todayStr(),
            },
          })
        }
        // 보스전 승리 기록 (boss_slayer)
        if (e.activity_type === 'boss' && e.is_correct && !(s.bossWins || []).includes(moduleId)) {
          s = { ...s, bossWins: [...(s.bossWins || []), moduleId] }
          saveLocal(s)
        }
        if (e.xp > 0) s = recordXp(s, e.xp, e.activity_type, moduleId)
        return s
      })
    }
  }

  function onModuleComplete(moduleId: string) {
    return (sum: { score: number; xpGained: number; durationSec: number }) => {
      setState(prev => {
        let s = recordProgress(prev, moduleId, { status: 'completed', best_score: sum.score, completed: true, total_time_seconds: sum.durationSec })
        s = recordXp(s, 50, 'module_clear', moduleId) // 모듈 클리어 보너스 (문항 XP는 이미 반영)
        syncBadges(s) // 뱃지 전수 판정 (첫 채굴·월드 정복·퍼펙트·스트릭·보스 사냥꾼 등)
        return s
      })
      // 복습 카드 시드 (내일부터 리젠)
      loadModule(moduleId).then(m => {
        if (!m.review_cards?.length || !state.learnerId) return
        const rows = m.review_cards.map(c => ({
          learner_id: state.learnerId, card_id: c.card_id, card_front: c.front, card_back: c.back,
          box: 1, due_date: kstTomorrowStr(),  // v1.4.4: KST 기준(구 toISOString UTC → KST 00~09시 당일 시드 버그 봉합)
        }))
        // ignore=true: 이미 광산에 있는 카드는 박스·일정 보존 (재플레이가 라이트너 성취를 리셋하지 않도록)
        enqueue({ kind: 'upsert', table: 'review_cards', payload: rows, conflict: 'learner_id,card_id', ignore: true })
      }).catch(() => {})
      refreshDueCount(state.learnerId) // 오답 리스폰 반영
      nav('/')
    }
  }

  // v1.3.0 유령 보스 통과 처리 (CONTRACT v1.3 §8) — 문항 이벤트·XP·리스폰은 onModuleEvent가 동일 처리
  function onGhostComplete(moduleId: string) {
    return (r: { correct: number; total: number; pct: number; stars: number }) => {
      if (r.stars >= 1) {
        setState(prev => {
          const { s, firstMastery } = recordGhostResult(prev, moduleId, r.stars)
          const ns = firstMastery ? recordXp(s, XP.ghostClear, 'ghost_boss', moduleId) : s
          syncBadges(ns)
          return ns
        })
      }
      refreshDueCount(state.learnerId) // 오답 리스폰 반영
      nav('/')
    }
  }

  function onDiagEvent(diagId: string) {
    return (e: { question_id: string; question_text?: string; given_answer?: string; correct_answer?: string; is_correct: boolean; response_ms?: number }) => {
      recordAnswer(state, { module_id: diagId, activity_type: 'diagnostic', ...e })
    }
  }

  function onDiagComplete(r: { diagId: string; pct: number; band: { label_ko: string; start_module: string } }) {
    setState(prev => {
      const diagDone = prev.diagDone.includes(r.diagId) ? prev.diagDone : [...prev.diagDone, r.diagId]
      // 배정 규칙 (A-006 v2): 시작점은 D1 밴드가 단일 축. 유일한 보정 = D4 정답률 60% 미만 시 월드1(최대 A3)로 하향.
      let placement = prev.placement
      if (r.diagId === 'D1') placement = r.band.start_module
      if (r.diagId === 'D4' && r.pct < 60 && placement === 'C0') placement = 'A3'
      let s: LocalState = { ...prev, diagDone, placement }
      saveLocal(s)
      s = recordProgress(s, `DIAG-${r.diagId}`, { status: 'completed', best_score: r.pct, completed: true })
      s = recordXp(s, 30, 'diagnostic_done', r.diagId)
      syncBadges(s) // 풀 스캔 포함 전수 판정 (서버 병합된 진단 이력까지 반영 — 유실 봉합)
      return s
    })
    const next = DIAG_ORDER.find(d => !state.diagDone.includes(d) && d !== r.diagId)
    nav(next ? `/diag/${next}` : '/')
  }

  // ── 라우팅 ──
  let screen: React.ReactNode
  if (route.startsWith('/admin')) screen = <AdminPage />
  else if (route.startsWith('/module/')) {
    const id = route.split('/')[2]
    screen = <ModuleSession moduleId={id} onEvent={onModuleEvent(id)} onComplete={onModuleComplete(id)} onExit={() => nav('/')} />
  } else if (route.startsWith('/diag')) {
    const id = route.split('/')[2] || DIAG_ORDER.find(d => !state.diagDone.includes(d)) || 'D1'
    screen = <DiagnosticRun diagId={id} onEvent={onDiagEvent(id)} onComplete={onDiagComplete} onExit={() => nav('/')} />
  } else if (route.startsWith('/ghost/')) {
    const id = route.split('/')[2]
    screen = <GhostBattle moduleId={id} onEvent={onModuleEvent(id)} onComplete={onGhostComplete(id)} onExit={() => nav('/')} />
  } else if (route.startsWith('/listen')) {
    screen = <ListenArcade onEvent={(mid, e) => onModuleEvent(mid)(e)} onExit={() => nav('/')} />
  } else if (route.startsWith('/vocab')) {
    // v1.4.16 단어 대륙 — 어휘 엔진 (기록: activity_type='vocab', module_id=<pack_id>)
    screen = <VocabContinent state={state} onAnswer={onVocabAnswer} onPackDone={onVocabPackDone} onGolemDone={onVocabGolemDone}
      onSortPerfect={onSortPerfect} onRapidResult={onRapidResult} onExit={() => nav('/')} />
  } else if (route.startsWith('/dex')) {
    // v1.4.19 단어 도감 — 잡은 워드몬 컬렉션 (review_cards 파생, 스키마 변경 0)
    screen = <WordDex state={state} onExit={() => nav('/vocab')} />
  } else if (route.startsWith('/runes')) {
    screen = <RuneDex state={state} onExit={() => nav('/')} />
  } else if (route.startsWith('/review')) {
    screen = <ReviewMine state={state} onXp={s => { setState(s); syncBadges(s) }} backsMap={backsMap}
      onFinished={() => refreshDueCount(state.learnerId)} />
  } else if (route.startsWith('/rewards')) {
    // v1.4.22 보상 창고 — 부모가 정한 보상까지 얼마나 남았는지 아이가 언제든 확인하는 곳
    screen = <RewardBoard state={state} dueCount={dueCount} vocabReady={!!latest?.vocab_ready} onGo={nav} />
  } else if (route.startsWith('/profile')) {
    screen = <Profile state={state} worldsReady={worldsReady} />
  } else if (route.startsWith('/info')) {
    screen = <AppInfo latest={latest} checking={checking} rechecking={rechecking} updateAvailable={updateAvailable}
      onUpdate={() => location.reload()} onRecheck={() => { setRechecking(true); void checkVersion() }} />
  } else if (route.startsWith('/connect')) {
    screen = <Connect onConnected={() => { location.hash = ''; location.reload() }} />
  } else if (route.startsWith('/family')) {
    screen = <FamilyDashboard />
  } else if (route.startsWith('/super')) {
    screen = <SuperConsole />
  } else if (authRole === 'guardian') {
    // 보호자가 학습 라우트로 새면 가족 대시보드로 (nav 반영 전 한 프레임 보호)
    screen = <FamilyDashboard />
  } else {
    screen = <WorldMap state={state} dueCount={dueCount} onOpenModule={id => nav(`/module/${id}`)} onOpenDiag={() => nav('/diag')}
      onOpenGhost={id => nav(`/ghost/${id}`)} onOpenListen={() => nav('/listen')} onOpenRunes={() => nav('/runes')}
      onOpenVocab={() => nav('/vocab')} vocabReady={!!latest?.vocab_ready}
      rewardGoals={rewardGoals} onOpenRewards={() => nav('/rewards')} worldsReady={worldsReady} />
  }

  const inSession = route.startsWith('/module/') || route.startsWith('/diag') || route.startsWith('/ghost/') || route.startsWith('/listen') || route.startsWith('/vocab') || route.startsWith('/dex')
  const isAdmin = route.startsWith('/admin')
  // 학습자 하단 네비 숨김: 관제실·가족 대시보드·연결 화면(보호자 흐름) — 학습앱 크롬 미노출
  const noLearnerChrome = isAdmin || route.startsWith('/family') || route.startsWith('/super') || route.startsWith('/connect') || authRole === 'guardian'

  return (
    <>
      {/* v1.4.22 — 하단 네비가 4칸에서 5칸(🎁 보상)이 됐다. app.css는 배포본과 크기 불일치 이월 과제라
          건드리지 않고 여기서 폭·글자만 조인다(칸이 좁아져 라벨이 줄바꿈되면 아이 눈에 지저분하다). */}
      <style>{`.bottomnav.nav5 button { font-size: 11px; padding: 9px 0 7px; }
.bottomnav.nav5 button span { font-size: 20px; }
.bottomnav.nav5 .nav-badge { right: 14%; }`}</style>
      {splash && <Splash variant={splashVariant} onDone={() => setSplash(false)} />}
      <div className="app">
        <main className="app-main">{screen}</main>
        {!inSession && !noLearnerChrome && (
          <nav className="bottomnav nav5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <button className={route === '/' ? 'on' : ''} onClick={() => nav('/')}><span>🗺️</span>월드맵</button>
            <button className={route.startsWith('/review') ? 'on' : ''} onClick={() => nav('/review')}>
              <span>⛏️</span>복습 광산{dueCount > 0 && <em className="nav-badge">{dueCount}</em>}
            </button>
            <button className={route.startsWith('/rewards') ? 'on' : ''} onClick={() => nav('/rewards')}>
              <span>🎁</span>보상{rewardAlert > 0 && <em className="nav-badge">{rewardAlert}</em>}
            </button>
            <button className={route.startsWith('/profile') ? 'on' : ''} onClick={() => nav('/profile')}><span>🧑‍🚀</span>내 정보</button>
            <button className={route.startsWith('/info') ? 'on' : ''} onClick={() => nav('/info')}>
              <span>ℹ️</span>정보{updateAvailable && <em className="nav-badge alert">!</em>}
            </button>
          </nav>
        )}
      </div>
    </>
  )
}
