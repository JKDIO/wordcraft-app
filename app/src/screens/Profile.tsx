import { useEffect, useState } from 'react'
// ★v1.4.40★ 화면이 보는 '오늘 학습 시간'도 출석 판정과 **같은 값**이어야 한다.
//   예전엔 getDailyActiveSec(=앱을 조작한 시간)을 보여 주면서 "15분 캐면 출석"이라고 적었는데,
//   실제 출석 판정은 서버 세션 시간이었다 — 아이가 보는 숫자와 판정 기준이 서로 달랐다.
import { todayFocusSec, ATTENDANCE_MIN_SEC, takeStreakFixNotice, type LocalState } from '../lib/store'
import { db } from '../lib/supabase'
import { levelProgress, levelTitle } from '../lib/xp'
import { moduleOrder } from '../lib/content'
import { BADGE_DEFS, BADGE_GROUPS, GROUP_EMOJI, type BadgeGroup } from '../lib/badges'
import { todayStr } from '../lib/leitner'
import { BadgeLoadout } from './BadgeLoadout'   // v1.4.28 ⚔️ 룬 장비창

const DOW = ['월', '화', '수', '목', '금', '토', '일']

export function Profile(props: { state: LocalState; worldsReady?: boolean }) {
  const s = props.state
  // v1.4.23: 승인 전에는 월드 7~10이 '클리어 n/28' 분모에 들어가지 않는다
  const ORDER_V = moduleOrder(props.worldsReady)
  const lp = levelProgress(s.xp)
  const onSeg = Math.min(10, Math.round((lp.cur / lp.need) * 10))
  const [badges, setBadges] = useState<string[]>([])
  const [reveal, setReveal] = useState<string | null>(null)
  // v1.4.27 — 뱃지 59개. 카테고리를 접었다 폈다 한다.
  // ★v1.4.30 (Dio님 지시) — 기본값은 **전부 접힘**.★
  //   이유: 뱃지가 71종이 되면서 "하나라도 딴 곳은 펼친다" 규칙이 화면을 수백 줄로 늘려 놓았다.
  //   아이가 내 정보를 열면 ⚔️ 룬 장비창(한 그림)이 먼저 보이고, 세부는 **스스로 골라 여는** 구조가 맞다.
  //   대신 여는 방법이 한눈에 보여야 하므로 머리글의 '열기 ▼'를 눈에 띄는 알약 버튼으로 만들었다.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!s.learnerId) return
    // ★v1.4.40★ selectAll — 뱃지는 71종이라 지금은 안전하지만, 규칙을 하나로 통일해 예외를 없앤다.
    db.selectAll('badges', `learner_id=eq.${s.learnerId}&select=badge_id&order=earned_at.desc`)
      .then(r => setBadges((r.rows as { badge_id: string }[]).map(x => x.badge_id)))
      .catch(() => {})
  }, [s.learnerId])

  const completed = ORDER_V.filter(id => {
    const p = s.progress[id]
    return p && (p.status === 'completed' || p.status === 'mastered')
  }).length

  /** v1.4.30 — 접힘이 기본. 명시적으로 연 카테고리만 true가 된다. */
  const groupOpen = (g: BadgeGroup) => openGroups[g] === true
  const anyOpen = BADGE_GROUPS.some(g => groupOpen(g))

  // 오늘 '실제로 문제를 푼 시간' (출석 15분 판정과 같은 산식) — 30초마다 새로고침
  const [dailySec, setDailySec] = useState(() => todayFocusSec())
  useEffect(() => {
    const t = setInterval(() => setDailySec(todayFocusSec()), 30000)
    return () => clearInterval(t)
  }, [])
  // ★v1.4.40★ 출석 기준을 정직하게 고치면서 연속 일수가 내려간 경우, 아이에게 **한 번만** 설명한다.
  //   숫자를 몰래 깎지 않는다 — 왜 바뀌었는지 아이가 알아야 납득한다(Dio님 결정 2026-08-16).
  const [streakFix] = useState(() => takeStreakFixNotice())
  const dailyMin = Math.floor(dailySec / 60)
  const needMin = Math.max(1, Math.ceil((ATTENDANCE_MIN_SEC - dailySec) / 60))

  // 이번 주(월~일) 출석 칩 (시안 07) — KST 날짜 기준
  const todayS = todayStr()
  const base = new Date(todayS + 'T12:00:00Z')
  const mondayOffset = (base.getUTCDay() + 6) % 7
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() - mondayOffset + k)
    return d.toISOString().slice(0, 10)
  })
  const attendance = s.attendance || []

  return (
    <div className="profile">
      {/* 레벨 카드 (시안 05): 72×72 골드 블록 + 세그먼트 바 + 다음 레벨 안내문 */}
      <div className="wc-lv-card">
        <div className="wc-lv-big">LV.{lp.level}</div>
        <h3>{s.nickname}</h3>
        <p className="wc-lv-title">{levelTitle(lp.level)}</p>
        <div className="xpbar-seg">
          {Array.from({ length: 10 }, (_, k) => <i key={k} className={k < onSeg ? 'on' : ''} />)}
        </div>
        {/* v1.4.40 — 예전엔 "다음 레벨 -1331"이라 **마이너스로 보였다**. 초6에게 마이너스는 '잃었다'로 읽힌다. */}
        <div className="xp-meta"><span>{lp.cur} / {lp.need} XP</span><span>다음 레벨까지 {(lp.need - lp.cur).toLocaleString()}</span></div>
        <p className="note wc-lv-note">{lp.need - lp.cur} XP만 더 캐면 레벨 {lp.level + 1}! 계속 파보자 ⛏️</p>
      </div>

      {/* v1.4.40 — 출석 기준을 정직하게 고친 뒤 연속 일수가 내려갔다면, 한 번만 설명한다.
          "네가 잘못한 게 아니라 앱이 잘못 세고 있었다"가 핵심이다. 비교·질책 문구는 쓰지 않는다. */}
      {streakFix && (
        <div className="wc-streak-fix">
          <b>🛠️ 기록을 더 정확하게 고쳤어!</b>
          <p>
            앱이 예전엔 <b>켜 두기만 한 시간</b>도 출석으로 세고 있었어. 이제는 <b>진짜로 문제를 푼 날</b>만 세.
            그래서 불꽃이 {streakFix.from}일 → <b>{streakFix.to}일</b>로 바뀌었어.
          </p>
          <p className="note">
            숫자는 줄었지만 <b>네가 푼 문제는 하나도 안 없어졌어.</b> 뱃지도 그대로야.
            {(s.bestStreak || 0) > 0 && <> 최고 기록 <b>{s.bestStreak}일</b>은 명예의 전당에 남겨 뒀어 🏆</>}
            {' '}오늘 15분만 하면 바로 이어져 🔥
          </p>
        </div>
      )}

      {/* 스트릭 히어로 (시안 07): 골드 테두리 + 불꽃 + 밈 문구. 출석 = 하루 15분 이상 **문제를 푼** 시간 */}
      <div className="wc-streak-hero">
        <span className="wc-flame">🔥</span>
        <h3>{s.streak_days}일 연속!</h3>
        <p className="note">{
          attendance.includes(todayS)
            ? `오늘 출석 완료! 내일도 15분 캐면 ${s.streak_days + 1}일 🔥`
            : dailyMin > 0
              ? `오늘 ${dailyMin}분 채굴 중 — ${needMin}분만 더 캐면 출석 도장 쾅! ⛏️`
              : '하루 15분 캐면 출석 불꽃이 켜져! 오늘도 지펴보자 🔥'
        }</p>
      </div>
      <div className="wc-week">
        {week.map((d, k) => {
          const done = attendance.includes(d)
          const isToday = d === todayS
          const future = d > todayS
          const cls = done ? 'is-done' : isToday ? 'is-today' : future ? 'is-future' : ''
          const mark = done ? '✓' : isToday ? '!' : '·'
          return <div key={d} className={`wc-day ${cls}`}>{DOW[k]}<b>{mark}</b></div>
        })}
      </div>

      <div className="stat-row">
        <div className="stat-tile"><b>⭐ {s.xp}</b><span>총 XP</span></div>
        <div className="stat-tile"><b>🔥 {s.streak_days}</b><span>연속 출석</span></div>
        {/* v1.4.40 — 최고 기록은 내려가지 않는다. 현재 불꽃이 꺼져도 '해낸 것'은 남는다. */}
        <div className="stat-tile"><b>🏆 {Math.max(s.bestStreak || 0, s.streak_days)}</b><span>최고 연속</span></div>
        <div className="stat-tile"><b>🗺️ {completed}/{ORDER_V.length}</b><span>클리어</span></div>
        <div className="stat-tile"><b>⛏️ {s.reviewTotal || 0}</b><span>복습 채굴</span></div>
        {/* v1.4.40 — 지령 미션·에코 사냥·문장 소환진처럼 **진도바를 안 움직이는 학습**.
            실측으로 예한이가 푼 문항의 20.6%(911개)가 여기였는데 어디에도 안 보였다.
            진도 분모는 그대로 두고(L46), '한 것'을 따로 센다. */}
        {(s.offTrack || 0) > 0 && (
          <div className="stat-tile"><b>⚡ {(s.offTrack || 0).toLocaleString()}</b><span>특별 훈련</span></div>
        )}
      </div>

      {/* 뱃지 도감 (시안 08 + v1.2.0): 미획득 뱃지는 탭하면 획득 조건·진행도 공개 → 목표 삼기 */}
      <h3 className="section-title wc-dex-head">🏆 뱃지 도감 <span className="wc-dex-count">{badges.length}/{Object.keys(BADGE_DEFS).length}</span></h3>
      {/* v1.4.28 ⚔️ 룬 장비창 — 도감(59칸 목록)보다 먼저, '지금 내가 얼마나 강해졌는가'를 한 그림으로 */}
      <BadgeLoadout earned={badges} onPickGroup={g => {
        // 슬롯을 누르면 그 카테고리만 펼치고 그 자리로 데려간다
        const next: Record<string, boolean> = {}
        for (const x of BADGE_GROUPS) next[x] = x === g
        setOpenGroups(next)
        setTimeout(() => document.getElementById(`bg-${BADGE_GROUPS.indexOf(g)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '2px 2px 4px' }}>
        {/* v1.4.30 — 전부 접혀 있으므로 "누르면 열린다"를 말로도 알려 준다 */}
        <p className="wc-dex-hint" style={{ margin: 0 }}>👇 분야를 눌러서 열어봐! 물음표엔 조건이 숨어 있어</p>
        <button
          data-wc-all-toggle={anyOpen ? 'close' : 'open'}
          onClick={() => {
            const next: Record<string, boolean> = {}
            for (const g of BADGE_GROUPS) next[g] = !anyOpen
            setOpenGroups(next)
          }}
          style={{
            background: 'var(--bg-1)', border: '1px solid var(--wc-surface-border)', borderRadius: 99,
            color: 'var(--wc-text)', fontSize: 12, fontWeight: 800, padding: '6px 11px',
            whiteSpace: 'nowrap', cursor: 'pointer',
          }}>
          {anyOpen ? '📁 전체 접기' : '📂 전체 펼치기'}
        </button>
      </div>
      {/* v1.4.27 — 뱃지가 59개. 성격별 10개 카테고리로 끊고 **접었다 폈다** 할 수 있게 했다.
          아이가 "나는 읽기가 4/4구나"처럼 자기 강약점을 스스로 읽을 수 있어야 하기 때문이다. */}
      {BADGE_GROUPS.map(g => {
        const ids = Object.entries(BADGE_DEFS).filter(([, b]) => b.group === g)
        if (!ids.length) return null
        const got = ids.filter(([id]) => badges.includes(id)).length
        const open = groupOpen(g)
        const pct = Math.round((got / ids.length) * 100)
        return (
          <div key={g} id={`bg-${BADGE_GROUPS.indexOf(g)}`}>
            {/* ⚠️ app.css는 배포본과 크기가 어긋나 있는 이월 과제라 새 클래스를 추가하지 않는다(인라인 스타일). */}
            <button
              data-wc-group={g}
              data-wc-open={open ? 1 : 0}
              onClick={() => setOpenGroups({ ...openGroups, [g]: !open })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                margin: '12px 0 6px', padding: '11px 10px 11px 12px', fontSize: 13, fontWeight: 800,
                background: got ? 'linear-gradient(90deg, rgba(245,197,66,.14), rgba(245,197,66,.03))' : 'var(--bg-1)',
                border: `1px solid ${got === ids.length ? 'var(--gold)' : 'var(--wc-surface-border)'}`,
                borderRadius: 'var(--radius)', color: 'var(--wc-text)', cursor: 'pointer',
              }}>
              <span style={{ fontSize: 15 }}>{GROUP_EMOJI[g]}</span>
              <span style={{ flex: 1 }}>{g}{got === ids.length && ids.length > 0 ? ' ✅' : ''}</span>
              <span style={{ width: 40, height: 5, background: '#1b2a3d', borderRadius: 99, overflow: 'hidden', flex: '0 0 auto' }}>
                <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: got === ids.length ? '#3ddc84' : '#4a9eff' }} />
              </span>
              <span style={{ fontSize: 11.5, opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>{got}/{ids.length}</span>
              {/* ★v1.4.30 — 여는 버튼을 '알약'으로 키워 한눈에 보이게. 닫혔을 땐 금색으로 채워 시선을 끌고,
                  열렸을 땐 조용한 테두리로 물러난다. (app.css 이월 과제 때문에 새 클래스 없이 인라인) */}
              <span style={{
                flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 11.5, fontWeight: 900, lineHeight: 1, padding: '6px 9px', borderRadius: 99,
                whiteSpace: 'nowrap',
                background: open ? 'transparent' : 'var(--gold, #f5c542)',
                color: open ? 'var(--text-2)' : '#1a1206',
                border: `1px solid ${open ? 'var(--wc-surface-border)' : 'transparent'}`,
                boxShadow: open ? 'none' : '0 0 0 3px rgba(245,197,66,.18)',
              }}>{open ? '닫기 ▲' : '열기 ▼'}</span>
            </button>
            {open && <div className="badge-grid">
              {ids.map(([id, b]) => {
                const isGot = badges.includes(id)
                const revealed = reveal === id
                if (isGot) return (
                  <div key={id} className="badge-card got">
                    <span className="badge-emoji">{b.emoji}</span>
                    <b>{b.name}</b>
                    <span className="badge-desc">{b.desc}</span>
                  </div>
                )
                const prog = b.progress ? b.progress(s) : null
                return (
                  <button key={id} className={`badge-card silhouette ${revealed ? 'revealed' : ''}`}
                    onClick={() => setReveal(revealed ? null : id)}>
                    <span className="badge-emoji">{revealed ? b.emoji : '❓'}</span>
                    <b>{revealed ? b.name : '???'}</b>
                    {revealed && (
                      <span className="badge-hint">
                        🎯 {b.hint}
                        {prog && prog.max > 1 && (
                          <span className="badge-prog">
                            <i style={{ width: `${Math.round((prog.cur / prog.max) * 100)}%` }} />
                            <em>{prog.cur}/{prog.max}</em>
                          </span>
                        )}
                      </span>
                    )}
                    {!revealed && <span className="badge-desc dim">탭해서 조건 보기</span>}
                  </button>
                )
              })}
            </div>}
          </div>
        )
      })}
    </div>
  )
}
