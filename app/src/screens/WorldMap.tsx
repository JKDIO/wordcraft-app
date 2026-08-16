import { useEffect, useState } from 'react'
import { WORLDS, MODULE_ORDER, worldList, moduleOrder, loadModule, isRuneModule, type ModuleDef } from '../lib/content'
import type { LocalState, ProgressEntry } from '../lib/store'
import { XP, levelProgress, levelTitle } from '../lib/xp'
import { buildRewardView, type RewardGoal } from '../lib/rewards'
import { todayStr } from '../lib/leitner'

// ── v1.3.0 유령 보스 출몰 규칙 (CONTRACT v1.3 §8) ──
const GHOST_FIRST_DAYS = 2   // 완료 D+2부터 첫 출몰
const GHOST_REMATCH_DAYS = 7 // 마스터 D+7부터 별 상향 리매치
const GHOST_MAX_VISIBLE = 3  // 동시 출몰 상한 (간격 분산 — 오래된 완료 순)
const WORLD_OPEN_KEY = 'wordcraft_world_open_v1' // v1.4.16 월드 접기 상태(기기별)

function daysSinceKST(iso: string | null | undefined): number {
  if (!iso) return -1
  const dayMs = 86400000
  const key = (d: Date) => new Date(d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }) + 'T00:00:00Z').getTime()
  return Math.round((key(new Date()) - key(new Date(iso))) / dayMs)
}

/** 유령 출몰 대상 모듈 집합 — 첫 도전(D+2, 미마스터) 우선 + 리매치(D+7, 별<3) */
export function ghostTargets(progress: Record<string, ProgressEntry>): Set<string> {
  const first: { id: string; at: string }[] = []
  const rematch: { id: string; at: string }[] = []
  for (const id of MODULE_ORDER) {
    const p = progress[id]
    if (!p || (p.status !== 'completed' && p.status !== 'mastered')) continue
    const stars = p.stars ?? 0
    if (stars <= 0) {
      if (daysSinceKST(p.completed_at) >= GHOST_FIRST_DAYS) first.push({ id, at: p.completed_at || '' })
    } else if (stars < 3) {
      if (daysSinceKST(p.mastered_at) >= GHOST_REMATCH_DAYS) rematch.push({ id, at: p.mastered_at || '' })
    }
  }
  first.sort((a, b) => a.at.localeCompare(b.at))
  rematch.sort((a, b) => a.at.localeCompare(b.at))
  return new Set([...first, ...rematch].slice(0, GHOST_MAX_VISIBLE).map(x => x.id))
}

export function WorldMap(props: {
  state: LocalState; dueCount: number
  onOpenModule: (id: string) => void; onOpenDiag: () => void
  onOpenGhost: (id: string) => void; onOpenListen: () => void; onOpenRunes: () => void
  onOpenVocab: () => void
  /** v1.4.22 보상 로드맵 — 부모가 등록한 목표. 월드맵 상단에 상설 노출한다. */
  rewardGoals?: RewardGoal[]
  onOpenRewards: () => void
  /** 음원 감사 PASS 전에는 입구를 열지 않는다(L22 — 무음 콘텐츠 노출 금지) */
  vocabReady?: boolean
  /** v1.4.23 확장 월드(6~9) — Dio님 승인 전에는 그려지지도 않는다 */
  worldsReady?: boolean
}) {
  const s = props.state
  // ★승인 전에는 확장 월드(6~9)가 목록에도, 진행률·잠금 계산에도 들어가지 않는다★
  const WORLDS_V = worldList(props.worldsReady)
  const ORDER_V = moduleOrder(props.worldsReady)
  const lp = levelProgress(s.xp)
  const onSeg = Math.min(10, Math.round((lp.cur / lp.need) * 10))
  const [meta, setMeta] = useState<Record<string, ModuleDef>>({})

  useEffect(() => {
    ORDER_V.forEach(id => {
      loadModule(id).then(m => setMeta(prev => ({ ...prev, [id]: m }))).catch(() => {/* 미제작 모듈 */})
    })
  }, [props.worldsReady])

  const diagAllDone = s.diagDone.length >= 4

  // v1.4.16 월드 접기 — 기기에 기억(additive: 새 localStorage 키, 기존 상태 불변).
  // 저장된 값이 없으면 "지금 할 월드"만 펼치고 나머지는 접는다(첫 화면 길이 최소화).
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(WORLD_OPEN_KEY)
      if (raw) return JSON.parse(raw) as Record<string, boolean>
    } catch { /* */ }
    const init: Record<string, boolean> = {}
    let picked = false
    for (const w of WORLDS_V) {
      const undone = w.modules.some(id => {
        const p = s.progress[id]
        return !(p && (p.status === 'completed' || p.status === 'mastered'))
      })
      const openThis = !picked && w.modules.length > 0 && undone
      if (openThis) picked = true
      init[String(w.world)] = openThis
    }
    if (!picked && WORLDS_V.length) init[String(WORLDS_V[0].world)] = true
    return init
  })
  useEffect(() => {
    try { localStorage.setItem(WORLD_OPEN_KEY, JSON.stringify(open)) } catch { /* */ }
  }, [open])
  function setAllOpen(v: boolean) {
    const next: Record<string, boolean> = {}
    for (const w of WORLDS_V) next[String(w.world)] = v
    setOpen(next)
  }

  function moduleState(id: string): 'done' | 'open' | 'locked' {
    const p = s.progress[id]
    if (p && (p.status === 'completed' || p.status === 'mastered')) return 'done'
    const i = ORDER_V.indexOf(id)
    // 진단 배정 (R-01 봉합): 배정 모듈까지의 모든 모듈은 잠금 해제 (A-006 v2 — 선행 모듈 skipped 취급)
    // v1.3.0: 수정 동굴(R*)은 진단 시절에 없던 신규 월드 — 배정 자동 해제에서 제외, 자체 순서 잠금만 따른다
    const placementIdx = s.placement ? ORDER_V.indexOf(s.placement) : 0
    if (i <= placementIdx && !isRuneModule(id)) return 'open'
    // 그 이후는 순서 잠금: 이전 모듈 완료 시 열림
    // v1.3.0: 본선(비 R 모듈)의 "이전 모듈"은 R 모듈을 건너뛴다 — 수정 동굴은 보너스 월드(본선 진도 비차단)
    if (i === 0) return 'open'
    let j = i - 1
    if (!isRuneModule(id)) while (j > 0 && isRuneModule(ORDER_V[j])) j--
    const prev = s.progress[ORDER_V[j]]
    return prev && (prev.status === 'completed' || prev.status === 'mastered') ? 'open' : 'locked'
  }

  const ghosts = ghostTargets(s.progress)

  // 잠김 해제 조건 문구 (A6): "○○ 클리어하면 열려!"
  function unlockNote(id: string): string {
    const i = ORDER_V.indexOf(id)
    let j = i - 1
    if (!isRuneModule(id)) while (j > 0 && isRuneModule(ORDER_V[j])) j-- // v1.3.0: 본선 안내는 R 모듈 건너뜀
    const prevId = j >= 0 ? ORDER_V[j] : ''
    const prevTitle = (prevId && meta[prevId]?.title_ko) || '이전 단계'
    return `${prevTitle} 클리어하면 열려!`
  }

  return (
    <div className="worldmap">
      <header className="topbar">
        <div className="topbar-left">
          <span className="avatar">🧑‍🚀</span>
          <div>
            <b>{s.nickname}</b>
            <span className="level-tag">{levelTitle(lp.level)}</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="streak" title="연속 출석 — 하루 15분 이상 학습하면 인정!">🔥 {s.streak_days}</span>
          <span className="xp-chip">⭐ {s.xp} XP</span>
        </div>
      </header>

      {/* XP HUD (시안 05): 골드 LV 배지 + 10칸 픽셀 세그먼트 + 바 밖 수치 */}
      <div className="wc-hud">
        <span className="wc-lv">LV.{lp.level}</span>
        <div className="wc-hud-col">
          <div className="xpbar-seg">
            {Array.from({ length: 10 }, (_, k) => <i key={k} className={k < onSeg ? 'on' : ''} />)}
          </div>
          {/* v1.4.41 — "다음 레벨 -1331"로 보이던 것. 내 정보(Profile)만 고치고 여기를 놓쳤다(L51 재발).
              초6에게 마이너스는 '잃었다'로 읽힌다. 남은 양은 양수로만 말한다. */}
          <div className="xp-meta"><span>{lp.cur} / {lp.need} XP</span><span>다음 레벨까지 {(lp.need - lp.cur).toLocaleString()}</span></div>
        </div>
      </div>

      {/* v1.4.22 보상 스트립 — 월드맵을 열 때마다 "다음 보상까지 얼마"가 눈에 들어오게.
          아이가 하루에 가장 많이 보는 화면이 월드맵이므로, 보상은 여기 상설로 있어야 한다. */}
      <RewardStrip goals={props.rewardGoals || []} totalXp={s.xp} onOpen={props.onOpenRewards} />

      {!diagAllDone && (
        <button className="diag-banner" onClick={props.onOpenDiag}>
          <span className="diag-emoji">📡</span>
          <span><b>플레이어 스캔 {s.diagDone.length}/4</b><br />네 능력치를 스캔하고 시작 지점을 찾자!</span>
          <span className="diag-arrow">▶</span>
        </button>
      )}

      {props.dueCount > 0 && (
        <button className="due-banner clickable" onClick={() => { location.hash = '/review' }}>
          ⛏️ 복습 광산에 캘 카드 <b>{props.dueCount}장</b> 리젠! 최대 <b>+{props.dueCount * XP.reviewCorrect + Math.floor(props.dueCount / XP.reviewComboEvery) * XP.reviewCombo} XP</b> — 캐러 가기 ▶
        </button>
      )}

      {/* 오늘의 학습 밸런스 (v1.2.0): 모험(기본코스)과 복습을 50:50으로 — 복습도 모험만큼 값지다! */}
      <BalanceMeter state={s} dueCount={props.dueCount} />

      {/* v1.4.18 ★특별 구역 포탈★
          이전(v1.4.16~17)에는 단어 대륙·소리 훈련소가 '복습 n장 리젠!' 알림과 똑같은 배너였다.
          같은 두께·같은 모양이라 아이 눈에는 "장소"가 아니라 "공지 줄"로 읽혀 들어가지 않는다.
          → 월드 타일과 같은 급의 **들어가는 문(포탈)** 으로 승격. 큰 아이콘·진행도·빛나는 테두리. */}
      <PortalDeck
        state={s}
        vocabReady={props.vocabReady}
        onOpenVocab={props.onOpenVocab}
        onOpenListen={props.onOpenListen}
      />

      {ghosts.size > 0 && (
        <div className="ghost-notice">
          👻 <b>유령 출몰!</b> 클리어한 모듈에 유령이 나타났어 — 진짜 배웠는지 시험하러 왔대. (이기면 👻별 획득!)
        </div>
      )}

      {/* v1.4.16 — 월드 아코디언: 화면이 세로로 너무 길어져서 월드 단위로 접는다.
          접힌 상태에서도 진행률·별·유령·다음 할 일을 한 줄로 보여준다(정보 손실 없이 길이만 줄이기). */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', margin: '2px 2px 8px' }}>
        <button className="btn ghost" style={miniBtn} onClick={() => setAllOpen(true)}>전체 펼치기</button>
        <button className="btn ghost" style={miniBtn} onClick={() => setAllOpen(false)}>전체 접기</button>
      </div>

      {WORLDS_V.map(w => {
        const key = String(w.world)
        const sum = worldSummary(w, s, moduleState, ghosts)
        const isOpen = open[key] !== false
        return (
        <section key={w.world} className="world">
          <h2
            className="world-title"
            onClick={() => setOpen(prev => ({ ...prev, [key]: !isOpen }))}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
            title={isOpen ? '접기' : '펼치기'}
          >
            <span style={{ display: 'inline-block', width: 14, transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'none', opacity: 0.8 }}>▶</span>
            {w.emoji} 월드 {w.world} — {w.name_ko}
            {sum.total > 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75, whiteSpace: 'nowrap' }}>
                {sum.done}/{sum.total}
              </span>
            )}
            {w.world === 1.5 && (
              <button className="runedex-btn" onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); props.onOpenRunes() }}>💎 룬 도감</button>
            )}
          </h2>

          {/* 접힘 요약 — 여기만 봐도 그 월드가 어떤 상태인지 안다 */}
          {!isOpen && <WorldFolded sum={sum} onOpen={() => setOpen(prev => ({ ...prev, [key]: true }))} />}

          {isOpen && (w.modules.length === 0 ? (
            (
              /* v1.4.24 — 월드 6(문장 소환진 공방)은 제거. 소환은 문법 단원 안의 스텝이다. */
              <p className="world-locked-note">다음 업데이트에서 열려! 지금 월드를 정복해 두자 💪</p>
            )
          ) : (
            <div className="wc-map">
              {w.modules.map((id, idx) => {
                const st = moduleState(id)
                const m = meta[id]
                const p = s.progress[id]
                const best = p?.best_score
                const n = starCount(best)
                const gStars = p?.stars ?? 0
                const hasGhost = ghosts.has(id)
                const prevDone = idx > 0 && moduleState(w.modules[idx - 1]) === 'done'
                const chip = st === 'done' ? 'CLEAR' : st === 'open' ? 'PLAY' : 'LOCK'
                const sub = st === 'locked'
                  ? unlockNote(id)
                  : hasGhost
                    ? '👻 유령의 시험이 기다린다 — 리매치!'
                    : st === 'done'
                      ? (m?.subtitle_ko || '완벽 채굴 도전 — 다시 플레이!')
                      : (m?.subtitle_ko || '지금 바로 캐러 가자! ⛏️')
                return (
                  <div key={id} className="wc-tile-wrap">
                    {idx > 0 && <div className={`link-v ${prevDone ? 'done' : ''}`} />}
                    <button
                      className={`wc-tile is-${st} ${hasGhost ? 'has-ghost' : ''}`}
                      disabled={st === 'locked'}
                      onClick={() => (hasGhost ? props.onOpenGhost(id) : props.onOpenModule(id))}
                    >
                      <span className="ico">{st === 'locked' ? '🔒' : hasGhost ? '👻' : (m?.emoji || '📦')}</span>
                      <span className="txt">
                        <h3>{m?.title_ko || id}</h3>
                        <span className="sub">{sub}</span>
                      </span>
                      <span className="right">
                        {st === 'done' && gStars > 0 && (
                          <span className="wc-stars ghost-stars" title="유령 보스 별">👻{'★'.repeat(gStars)}</span>
                        )}
                        {st === 'done' && <span className="wc-stars">{'★'.repeat(n)}<span className="off">{'★'.repeat(3 - n)}</span></span>}
                        <span className="state-chip">{chip}</span>
                      </span>
                    </button>
                    {hasGhost && st === 'done' && (
                      <button className="ghost-replay" onClick={() => props.onOpenModule(id)}>모듈 다시 풀기는 여기 →</button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </section>
        )
      })}
    </div>
  )
}

const miniBtn = { padding: '4px 10px', fontSize: 12 } as const

// ── v1.4.22 보상 스트립 ──────────────────────────────────────────
// 부모가 등록한 보상 중 **다음 하나**만 보여준다(로드맵 전체는 🎁 탭에서).
// 목표는 가까울수록 세게 당긴다(goal-gradient) → 남은 XP를 숫자로 크게 박고, 눌러서 창고로 들어가게 한다.
// 등록된 보상이 하나도 없으면 아무것도 그리지 않는다 — 빈 약속을 걸어두지 않는다.
function RewardStrip(props: { goals: RewardGoal[]; totalXp: number; onOpen: () => void }) {
  if (!props.goals.length) return null
  const view = buildRewardView(props.goals, props.totalXp)
  const pending = view.pending[0]
  const next = view.next

  if (pending) {
    return (
      <button onClick={props.onOpen} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
        background: 'linear-gradient(140deg,#3a2a06 0%,#4a2f10 100%)', border: '2px solid #ffd050',
        borderRadius: 14, padding: '11px 12px', margin: '4px 0 10px', color: '#fff6dd',
      }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{pending.goal.emoji}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14 }}>🎉 「{pending.goal.title}」 달성!</b>
          <span style={{ fontSize: 11.5, opacity: .85 }}>아빠한테 보여주자 — 탭해서 보기</span>
        </span>
        <span style={{ fontSize: 13, opacity: .8 }}>▶</span>
      </button>
    )
  }
  if (!next) {
    return (
      <button onClick={props.onOpen} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
        background: '#10281a', border: '1px solid #2f7d52', borderRadius: 14, padding: '10px 12px',
        margin: '4px 0 10px', color: '#dff5e8',
      }}>
        <span style={{ fontSize: 22 }}>🏆</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>보상 전부 달성! 다음 보상을 기다리는 중</span>
        <span style={{ fontSize: 13, opacity: .7 }}>▶</span>
      </button>
    )
  }
  return (
    <button onClick={props.onOpen} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
      background: 'linear-gradient(140deg,#221a06 0%,#122036 100%)', border: '1.5px solid #c9a227',
      borderRadius: 14, padding: '10px 12px', margin: '4px 0 10px', color: '#fff6dd',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{next.goal.emoji}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            다음 보상 · {next.goal.title}
          </b>
          <span style={{ fontSize: 11, opacity: .7 }}>{next.goal.threshold_xp.toLocaleString()} XP에서 열린다</span>
        </span>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {/* v1.4.41 — 여기도 "-380 / XP 남음"이었다. 라벨이 이미 '남음'이므로 부호는 필요 없다. */}
          <b style={{ fontSize: 17, color: '#ffd050' }}>{next.remaining.toLocaleString()}</b>
          <span style={{ fontSize: 10.5, opacity: .7, display: 'block' }}>XP 남음</span>
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(0,0,0,.4)', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ width: `${Math.max(next.pct, 2)}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#ffb020,#ffe28a)' }} />
      </div>
    </button>
  )
}

// ── v1.4.18 특별 구역 포탈 ────────────────────────────────────────────
// 왜 만들었나: 단어 대륙·소리 훈련소가 '복습 n장 리젠!' 알림과 **똑같은 배너**로 그려져 있었다.
// 같은 두께·같은 모서리·같은 한 줄 텍스트 → 아이 눈에는 "들어가는 곳"이 아니라 "공지 줄"이다.
// 실제로 이 둘은 월드와 같은 급의 **상설 구역**이므로, 알림보다 위계를 올려 '문'처럼 보이게 한다.
// app.css는 배포본과 크기 불일치 이월 과제가 있어 건드리지 않는다 → keyframes는 컴포넌트가 직접 주입.
const VOCAB_PACK_RE = /^V\d{1,2}-\d{2}$/

interface PortalDef {
  key: string; emoji: string; title: string; sub: string
  cta: string; badge?: string
  hue: { bg: string; border: string; glow: string; accent: string }
  progress?: { pct: number; label: string }
  chips?: string[]
  onClick: () => void
}

function PortalDeck(props: {
  state: LocalState; vocabReady?: boolean
  onOpenVocab: () => void; onOpenListen: () => void
}) {
  const s = props.state
  const packsDone = Object.keys(s.progress).filter(id => {
    if (!VOCAB_PACK_RE.test(id)) return false
    const st = s.progress[id]?.status
    return st === 'completed' || st === 'mastered'
  }).length
  const words = packsDone * 12

  const portals: PortalDef[] = []
  if (props.vocabReady) {
    portals.push({
      key: 'vocab', emoji: '🗺️', title: '단어 대륙',
      sub: packsDone === 0 ? '2,400단어의 땅 — 첫 상륙!' : `${words.toLocaleString()}단어 확보 · 계속 정복`,
      cta: packsDone === 0 ? '상륙하기' : '이어서 정복',
      badge: packsDone === 0 ? 'NEW' : undefined,
      hue: { bg: 'linear-gradient(150deg,#0e2f26 0%,#12304a 100%)', border: '#2f9c72', glow: 'rgba(61,220,132,.45)', accent: '#5ee6a0' },
      progress: { pct: Math.round((packsDone / 200) * 100), label: `${packsDone}/200 구역` },
      onClick: props.onOpenVocab,
    })
  }
  portals.push({
    key: 'listen', emoji: '🎧', title: '소리 훈련소',
    sub: '진짜 사람 목소리로 귀를 단련하는 곳',
    chips: ['📡 에코 사냥', '🎯 지령 미션'],
    cta: '입장하기',
    hue: { bg: 'linear-gradient(150deg,#251a3d 0%,#1a2446 100%)', border: '#7b5cc9', glow: 'rgba(160,120,255,.45)', accent: '#b79bff' },
    onClick: props.onOpenListen,
  })

  const two = portals.length > 1
  return (
    <section style={{ margin: '14px 0 12px' }}>
      <style>{`
@keyframes wcPortalGlow { 0%,100% { box-shadow: 0 0 0 0 var(--pg), 0 6px 18px rgba(0,0,0,.35); }
                          50%     { box-shadow: 0 0 22px 2px var(--pg), 0 6px 18px rgba(0,0,0,.35); } }
@keyframes wcPortalRing { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes wcNewPop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
.wc-portal { animation: wcPortalGlow 3.4s ease-in-out infinite; }
.wc-portal:active { transform: translateY(1px); }
.wc-portal-ring { animation: wcPortalRing 14s linear infinite; }
.wc-new { animation: wcNewPop 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .wc-portal, .wc-portal-ring, .wc-new { animation: none !important; }
}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 8px' }}>
        <span style={{ fontSize: 12, letterSpacing: 2, opacity: .55, fontWeight: 700 }}>특별 구역</span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#2a3a4f,transparent)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: two ? '1fr 1fr' : '1fr', gap: 10 }}>
        {portals.map(p => (
          <button
            key={p.key}
            className="wc-portal"
            onClick={p.onClick}
            style={{
              position: 'relative', overflow: 'hidden', cursor: 'pointer', font: 'inherit', color: '#eaf1fa',
              background: p.hue.bg, border: `2px solid ${p.hue.border}`, borderRadius: 18,
              padding: two ? '14px 12px 12px' : '16px 16px 14px', textAlign: 'left',
              display: 'flex', flexDirection: 'column', minHeight: 196,
              ['--pg' as string]: p.hue.glow,
            }}
          >
            {/* 포탈 링 — 배경에서 천천히 도는 마법진 */}
            <span className="wc-portal-ring" aria-hidden style={{
              position: 'absolute', right: -34, top: -34, width: 108, height: 108, borderRadius: '50%',
              border: `2px dashed ${p.hue.border}`, opacity: .3, pointerEvents: 'none',
            }} />
            {p.badge && (
              <span className="wc-new" style={{
                position: 'absolute', right: 10, top: 10, background: '#ff5470', color: '#fff',
                fontSize: 10, fontWeight: 800, letterSpacing: .5, padding: '3px 7px', borderRadius: 8,
              }}>{p.badge}</span>
            )}

            <div style={{ fontSize: two ? 34 : 40, lineHeight: 1 }}>{p.emoji}</div>
            <div style={{ fontSize: two ? 17 : 20, fontWeight: 800, marginTop: 8, letterSpacing: -.3 }}>{p.title}</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 4, lineHeight: 1.45 }}>{p.sub}</div>

            {p.chips && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {p.chips.map(c => (
                  <span key={c} style={{
                    fontSize: 10.5, background: 'rgba(255,255,255,.08)', border: `1px solid ${p.hue.border}55`,
                    borderRadius: 8, padding: '3px 7px', whiteSpace: 'nowrap',
                  }}>{c}</span>
                ))}
              </div>
            )}

            {p.progress && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 5, background: 'rgba(0,0,0,.35)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(p.progress.pct, 2)}%`, height: '100%', background: p.hue.accent, borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 10.5, opacity: .65, marginTop: 4 }}>{p.progress.label}</div>
              </div>
            )}

            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              marginTop: 'auto', paddingTop: 12, alignSelf: 'flex-start',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: p.hue.accent, color: '#08131c', fontWeight: 800, fontSize: 12.5,
                padding: '7px 13px', borderRadius: 99,
              }}>{p.cta} <span style={{ fontSize: 11 }}>▶</span></span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}


interface WorldSum {
  total: number; done: number; stars: number; maxStars: number
  ghosts: number; locked: boolean; nextTitle: string | null; special: 'soon' | null
}

/** 월드 한 줄 요약 계산 — 접힌 상태에서 보여줄 값들 */
function worldSummary(
  w: { world: number; modules: string[] },
  s: LocalState,
  moduleState: (id: string) => 'done' | 'open' | 'locked',
  ghosts: Set<string>,
): WorldSum {
  if (w.modules.length === 0) {
    return { total: 0, done: 0, stars: 0, maxStars: 0, ghosts: 0, locked: false, nextTitle: null, special: 'soon' }
  }
  let done = 0, stars = 0, gh = 0, allLocked = true
  let nextId: string | null = null
  for (const id of w.modules) {
    const st = moduleState(id)
    if (st !== 'locked') allLocked = false
    if (st === 'done') { done++; stars += starCount(s.progress[id]?.best_score) }
    else if (st === 'open' && !nextId) nextId = id
    if (ghosts.has(id)) gh++
  }
  return {
    total: w.modules.length, done, stars, maxStars: w.modules.length * 3,
    ghosts: gh, locked: allLocked, nextTitle: nextId, special: null,
  }
}

/** 접힌 월드의 요약 카드 — 진행 바 + 칩. 누르면 펼쳐진다. */
function WorldFolded(props: { sum: WorldSum; onOpen: () => void }) {
  const w = props.sum
  const chip = (bg: string, text: string) => (
    <span style={{ background: bg, borderRadius: 8, padding: '2px 8px', fontSize: 12, whiteSpace: 'nowrap' }}>{text}</span>
  )
  if (w.special === 'soon') {
    return <button onClick={props.onOpen} style={{ ...foldedBox, opacity: 0.65 }}>🔜 다음 업데이트에서 열려!</button>
  }
  const pct = w.total ? Math.round((w.done / w.total) * 100) : 0
  return (
    <button onClick={props.onOpen} style={foldedBox}>
      <div style={{ height: 6, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: w.done === w.total ? '#3ddc84' : '#4a9eff', borderRadius: 99 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {chip(w.done === w.total ? '#123a22' : '#1b2a3d', `${w.done}/${w.total} 클리어`)}
        {w.stars > 0 && chip('#2b2410', `★ ${w.stars}/${w.maxStars}`)}
        {w.ghosts > 0 && chip('#2a1633', `👻 ${w.ghosts}`)}
        {w.locked
          ? chip('#20293a', '🔒 아직 잠김')
          : w.nextTitle
            ? chip('#123049', '▶ 이어서 하기')
            : w.done === w.total ? chip('#123a22', '🏆 월드 완전정복!') : null}
      </div>
    </button>
  )
}

const foldedBox = {
  display: 'block', width: '100%', textAlign: 'left' as const, cursor: 'pointer',
  background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14,
  padding: '10px 12px', margin: '4px 0 10px', color: '#eaf1fa', font: 'inherit',
}

/** 오늘의 학습 밸런스 미터 — 모험 XP vs 복습 XP (목표 50:50) */
function BalanceMeter(props: { state: LocalState; dueCount: number }) {
  const d = props.state.dailyXp
  const today = todayStr()
  const course = d?.date === today ? d.course : 0
  const review = d?.date === today ? d.review : 0
  const total = course + review
  if (total === 0) return null // 오늘 아직 시작 전 — 조용히
  const pct = Math.round((review / total) * 100)
  const msg = pct >= 40 && pct <= 60
    ? '⚖️ 황금 밸런스! 모험과 복습이 완벽한 조화 👑'
    : pct < 40
      ? (props.dueCount > 0 ? `⛏️ 복습 광산이 기다려! 캐면 바로 밸런스 UP (+${XP.reviewCorrect}씩)` : '⛏️ 오늘 복습 카드를 다 캤다면 OK!')
      : '🗺️ 복습 만렙! 이제 새 모험을 떠나볼까?'
  return (
    <div className="balance-meter">
      <div className="balance-head"><b>오늘의 밸런스</b><span>모험 {course} XP · 복습 {review} XP</span></div>
      <div className="balance-bar">
        <i className="course" style={{ width: `${100 - pct}%` }} />
        <i className="review" style={{ width: `${pct}%` }} />
        <em className="mid" />
      </div>
      <p className="balance-msg">{msg}</p>
    </div>
  )
}

// 별점 (A3): 정답률 기준 켜진 별 개수 — 90+:3, 70~89:2, ~69:0 (시안 06 표기)
function starCount(best: number | null | undefined): number {
  if (best == null) return 0
  if (best >= 90) return 3
  if (best >= 70) return 2
  return 0
}
