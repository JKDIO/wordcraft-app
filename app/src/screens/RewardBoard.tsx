import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/supabase'
import type { LocalState } from '../lib/store'
import { XP } from '../lib/xp'
import { buildRewardView, dailyXpAverage, etaDays, type RewardGoal } from '../lib/rewards'
import { todayStr } from '../lib/leitner'

/* ─────────────────────────────────────────────────────────────
   🎁 보상 창고 — 예한이 화면 (v1.4.22)

   설계 의도 (근거를 남긴다):
   - 목표는 **구체적이고 눈에 보여야** 힘을 낸다. "1,000 XP"가 아니라 "치킨 파티"가 목표다.
   - 목표에 가까워질수록 노력이 커진다(goal-gradient). 그래서 화면의 주인공은
     '전체 진행률'이 아니라 **다음 보상 하나**이고, 남은 XP를 가장 크게 쓴다.
   - 동기는 **행동으로 바뀌어야** 의미가 있다 → "지금 이걸 하면 +N XP" 버튼을 바로 붙인다.
   - 도달했는데 부모가 아직 지급 안 한 보상은 축하 배너로 띄운다(아이가 먼저 알고 말할 수 있게).
   - 처벌·비교·감점 문구는 없다(프로젝트 헌법). 못 받은 보상은 '실패'가 아니라 '아직'이다.

   ⚠️ app.css는 배포본과 크기 불일치 이월 과제가 있어 새 클래스를 추가하지 않는다 → 인라인 스타일 + <style> 주입.
──────────────────────────────────────────────────────────────*/

const CACHE_KEY = 'wordcraft_reward_goals_v1'

/** 오프라인에서도 보상이 보여야 한다 — 마지막으로 읽은 목표를 기기에 캐시한다(읽기 전용 사본). */
function readCache(): RewardGoal[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') as RewardGoal[] } catch { return [] }
}
function writeCache(g: RewardGoal[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(g)) } catch { /* */ }
}

export function useRewardGoals(learnerId: string | null): { goals: RewardGoal[]; loading: boolean } {
  const [goals, setGoals] = useState<RewardGoal[]>(() => readCache())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!learnerId) { setLoading(false); return }
    let alive = true
    db.select('reward_goals', `learner_id=eq.${learnerId}&order=threshold_xp.asc&limit=200`)
      .then(rows => {
        if (!alive) return
        const g = rows as unknown as RewardGoal[]
        setGoals(g); writeCache(g)
      })
      .catch(() => { /* 오프라인 — 캐시 유지 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [learnerId])
  return { goals, loading }
}

export function RewardBoard(props: {
  state: LocalState
  dueCount: number
  vocabReady?: boolean
  onGo: (route: string) => void
}) {
  const s = props.state
  const { goals, loading } = useRewardGoals(s.learnerId)
  const [pace, setPace] = useState<{ avg: number; sampleDays: number }>({ avg: 0, sampleDays: 0 })

  useEffect(() => {
    if (!s.learnerId) return
    const since = new Date(Date.now() - 14 * 86400_000).toISOString()
    // ★v1.4.40★ selectAll — 정답 1건당 xp_events 1행이라 14일치는 수천 건이 된다(실측 4,110행).
    db.selectAll('xp_events', `learner_id=eq.${s.learnerId}&created_at=gte.${since}&select=amount,created_at&order=created_at.desc`)
      .then(r => setPace(dailyXpAverage(r.rows as unknown as { amount: number; created_at: string }[])))
      .catch(() => { /* 오프라인 — 예상일 미표시 */ })
  }, [s.learnerId])

  const view = useMemo(() => buildRewardView(goals, s.xp), [goals, s.xp])
  const todayXp = s.dailyXp?.date === todayStr() ? (s.dailyXp.course + s.dailyXp.review) : 0

  return (
    <div className="profile" style={{ paddingBottom: 24 }}>
      <style>{`
@keyframes wcRwShine { 0% { transform: translateX(-120%); } 60%,100% { transform: translateX(320%); } }
@keyframes wcRwPulse { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255,208,80,0)); }
                       50% { transform: scale(1.07); filter: drop-shadow(0 0 14px rgba(255,208,80,.75)); } }
@keyframes wcRwPop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.wc-rw-shine { animation: wcRwShine 2.8s ease-in-out infinite; }
.wc-rw-em { animation: wcRwPulse 2.2s ease-in-out infinite; display:inline-block; }
.wc-rw-pop { animation: wcRwPop 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .wc-rw-shine, .wc-rw-em, .wc-rw-pop { animation: none !important; } }
`}</style>

      <h3 className="section-title" style={{ marginTop: 4 }}>🎁 보상 창고</h3>

      {/* ── 달성했는데 아직 못 받은 보상: 가장 먼저, 가장 크게 축하한다 ── */}
      {view.pending.map(st => (
        <div key={st.goal.id} className="wc-rw-pop" style={{
          background: 'linear-gradient(140deg,#3a2a06 0%,#4a2f10 100%)', border: '2px solid #ffd050',
          borderRadius: 16, padding: '14px 14px 12px', margin: '10px 0', color: '#fff6dd',
        }}>
          <div style={{ fontSize: 30, lineHeight: 1 }}>{st.goal.emoji}</div>
          <div style={{ fontWeight: 900, fontSize: 17, marginTop: 6 }}>🎉 「{st.goal.title}」 달성!</div>
          <div style={{ fontSize: 12.5, opacity: .9, marginTop: 4, lineHeight: 1.5 }}>
            {st.goal.threshold_xp.toLocaleString()} XP를 진짜로 넘었어. 아빠한테 보여주자!
          </div>
        </div>
      ))}

      {/* ── 다음 보상: 이 화면의 주인공 ── */}
      {view.next ? (
        <NextRewardHero step={view.next} totalXp={s.xp} pace={pace} todayXp={todayXp} />
      ) : goals.length > 0 ? (
        <div style={{
          background: 'linear-gradient(140deg,#0f2f1e 0%,#12304a 100%)', border: '2px solid #3ddc84',
          borderRadius: 18, padding: 18, margin: '10px 0', textAlign: 'center', color: '#eaf1fa',
        }}>
          <div style={{ fontSize: 40 }}>🏆</div>
          <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>보상 전부 달성!</div>
          <p style={{ fontSize: 12.5, opacity: .82, marginTop: 6, lineHeight: 1.5 }}>
            등록된 보상을 전부 넘었어. 아빠가 다음 보상을 정해 줄 거야 — 그때까지 XP는 계속 쌓인다 ⭐
          </p>
        </div>
      ) : (
        <div style={{
          background: '#0f1a28', border: '1px dashed #2b4162', borderRadius: 16,
          padding: 18, margin: '10px 0', textAlign: 'center', color: '#cfe0f2',
        }}>
          <div style={{ fontSize: 36 }}>{loading ? '⏳' : '🎁'}</div>
          <div style={{ fontWeight: 800, marginTop: 8, fontSize: 15 }}>
            {loading ? '보상 불러오는 중…' : '아빠가 보상을 정하는 중이야!'}
          </div>
          <p style={{ fontSize: 12.5, opacity: .75, marginTop: 6, lineHeight: 1.55 }}>
            {loading ? ' ' : '보상이 정해지면 여기에 뜬다. 그동안 모은 XP는 하나도 안 없어져 — 지금 캔 게 나중에 다 값이 돼 ⭐'}
          </p>
        </div>
      )}

      {/* ── XP를 지금 버는 방법: 동기를 행동으로 바꾸는 자리 ── */}
      {view.next && (
        <div style={{ margin: '14px 0 6px' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, opacity: .55, fontWeight: 700, margin: '0 2px 8px' }}>지금 XP 캐러 가기</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {props.dueCount > 0 && (
              <ActionTile emoji="⛏️" title="복습 광산" sub={`${props.dueCount}장 리젠 · 최대 +${props.dueCount * XP.reviewCorrect}`}
                onClick={() => props.onGo('/review')} />
            )}
            {props.vocabReady && (
              <ActionTile emoji="🗺️" title="단어 대륙" sub={`한 구역 정복 = +${XP.vocabPack} 이상`} onClick={() => props.onGo('/vocab')} />
            )}
            <ActionTile emoji="🏔️" title="월드맵" sub={`모듈 하나 클리어 = +${XP.moduleClear} 보너스`} onClick={() => props.onGo('/')} />
            <ActionTile emoji="🎧" title="소리 훈련소" sub={`한 문제 맞히면 +${XP.correct}`} onClick={() => props.onGo('/listen')} />
          </div>
        </div>
      )}

      {/* ── 보상 사다리 ── */}
      {goals.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 18 }}>
            🪜 보상 사다리 <span className="wc-dex-count">{view.reachedCount}/{goals.length}</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {view.steps.map(st => {
              const isNext = view.next?.goal.id === st.goal.id
              const bg = st.granted ? '#10281a' : st.reached ? '#2c2208' : isNext ? '#0f2440' : '#0f1a28'
              const border = st.granted ? '#2f7d52' : st.reached ? '#ffd050' : isNext ? '#4a9eff' : '#21324a'
              return (
                <div key={st.goal.id} style={{
                  background: bg, border: `${isNext || st.reached ? 2 : 1}px solid ${border}`, borderRadius: 14,
                  padding: '11px 12px', color: '#eaf1fa',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24, lineHeight: 1, opacity: st.reached || isNext ? 1 : .45 }}>{st.goal.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {st.goal.title}
                      </div>
                      <div style={{ fontSize: 11.5, opacity: .7, marginTop: 2 }}>{st.goal.threshold_xp.toLocaleString()} XP</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', borderRadius: 8, padding: '4px 8px',
                      background: st.granted ? '#1b4a30' : st.reached ? '#5a3f06' : isNext ? '#123049' : '#1a2434',
                      color: st.granted ? '#8ff0b8' : st.reached ? '#ffd050' : isNext ? '#8fc6ff' : '#8fa2b8',
                    }}>
                      {st.granted ? '🏆 받았다!' : st.reached ? '🎉 달성' : isNext ? `-${st.remaining.toLocaleString()}` : `-${st.remaining.toLocaleString()}`}
                    </span>
                  </div>
                  {!st.reached && (
                    <div style={{ height: 6, background: 'rgba(0,0,0,.35)', borderRadius: 99, overflow: 'hidden', marginTop: 9 }}>
                      <div style={{ width: `${Math.max(st.pct, 2)}%`, height: '100%', borderRadius: 99, background: isNext ? '#4a9eff' : '#33526f' }} />
                    </div>
                  )}
                  {st.goal.note && <p style={{ fontSize: 11.5, opacity: .68, margin: '8px 0 0', lineHeight: 1.5 }}>{st.goal.note}</p>}
                </div>
              )
            })}
          </div>
        </>
      )}

      <p style={{ fontSize: 11.5, opacity: .55, margin: '16px 2px 0', lineHeight: 1.6, color: '#cfe0f2' }}>
        ⭐ 지금까지 모은 XP는 <b>{s.xp.toLocaleString()}</b>. XP는 줄어들지 않아 — 틀려도 안 깎여.
      </p>
    </div>
  )
}

/** 다음 보상 히어로 카드 — 화면에서 제일 크고 제일 밝은 것 */
function NextRewardHero(props: {
  step: ReturnType<typeof buildRewardView>['steps'][number]
  totalXp: number
  pace: { avg: number; sampleDays: number }
  todayXp: number
}) {
  const { step, pace } = props
  const eta = etaDays(step.remaining, pace.avg, pace.sampleDays)
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(150deg,#2a1f04 0%,#132b47 100%)', border: '2px solid #ffd050',
      borderRadius: 20, padding: '18px 16px 16px', margin: '10px 0 4px', color: '#fff6dd',
      boxShadow: '0 0 26px rgba(255,208,80,.18)',
    }}>
      {/* 스치는 광택 */}
      <span className="wc-rw-shine" aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, width: 70, pointerEvents: 'none',
        background: 'linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent)',
      }} />
      <div style={{ fontSize: 11.5, letterSpacing: 2, opacity: .7, fontWeight: 800 }}>다음 보상</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <span className="wc-rw-em" style={{ fontSize: 46, lineHeight: 1 }}>{step.goal.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: -.4, lineHeight: 1.2 }}>{step.goal.title}</div>
          <div style={{ fontSize: 12, opacity: .75, marginTop: 3 }}>{step.goal.threshold_xp.toLocaleString()} XP에서 열린다</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 14 }}>
        <b style={{ fontSize: 40, lineHeight: 1, color: '#ffd050', letterSpacing: -1 }}>{step.remaining.toLocaleString()}</b>
        <span style={{ fontSize: 15, fontWeight: 800, opacity: .9 }}>XP 남았다!</span>
      </div>

      <div style={{ height: 12, background: 'rgba(0,0,0,.4)', borderRadius: 99, overflow: 'hidden', marginTop: 10, border: '1px solid rgba(255,208,80,.25)' }}>
        <div style={{
          width: `${Math.max(step.pct, 2)}%`, height: '100%', borderRadius: 99,
          background: 'linear-gradient(90deg,#ffb020,#ffe28a)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: .75, marginTop: 5 }}>
        <span>{props.totalXp.toLocaleString()} XP</span>
        <span>{step.pct}%</span>
        <span>{step.goal.threshold_xp.toLocaleString()} XP</span>
      </div>

      <p style={{ fontSize: 12.5, margin: '12px 0 0', lineHeight: 1.55, opacity: .92 }}>
        {eta === 0
          ? '거의 다 왔다!'
          : eta != null
            ? <>지금 페이스(하루 평균 <b>{pace.avg.toLocaleString()}</b> XP)면 <b>{eta}일</b>이면 도착 🚀</>
            : '오늘 조금만 캐도 바로 가까워진다 ⛏️'}
        {props.todayXp > 0 && <> · 오늘 벌써 <b>+{props.todayXp}</b> XP</>}
      </p>
    </div>
  )
}

function ActionTile(props: { emoji: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={props.onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', cursor: 'pointer', font: 'inherit',
      background: '#0f1a28', border: '1px solid #21324a', borderRadius: 14, padding: '11px 12px', color: '#eaf1fa',
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{props.emoji}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13.5 }}>{props.title}</b>
        <span style={{ fontSize: 11, opacity: .68 }}>{props.sub}</span>
      </span>
    </button>
  )
}
