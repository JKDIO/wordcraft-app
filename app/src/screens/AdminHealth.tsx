/** 관제실 v3 — '오늘 브리핑' + '정합성 진단' (v1.4.35 신설)
 *
 * 왜 만들었나: 관제실은 지금까지 **숫자를 보여주기만** 했다. 그 숫자가 맞는지, 아이 앱이 보는 것과
 * 같은지는 아무도 확인하지 않았고, 실제로 2026-08-15에는 문항 0개인 날을 "학습 703분 · 목표 달성 ✓"으로
 * 표시하고 있었다. 대시보드가 틀린 숫자를 자신 있게 말하면, 그건 없는 것보다 나쁘다.
 *
 * 그래서 이 화면은 두 가지를 한다.
 *   ① **오늘 무엇을 하면 되는지** 한 문단으로 말한다(숫자가 아니라 행동).
 *   ② **자기 자신을 의심한다** — 아이 앱과 어긋난 지점, 깨진 기록, 조회 상한을 스스로 찾아 띄운다.
 *      그리고 고칠 수 있는 것은 여기서 바로 고친다(뱃지 되메우기).
 *
 * 판정 규칙은 전부 `lib/adminMetrics.ts`에 있다. 이 파일은 그리기만 한다(L27).
 */
import { useState } from 'react'
import { db } from '../lib/supabase'
import { BADGE_DEFS } from '../lib/badges'
import type { IntegrityIssue, CoachTip, StudyTime, AccuracySplit, ReviewDebt, ProgressView } from '../lib/adminMetrics'
import { GOAL_SEC, FAST_REVIEW_MIN_N, FAST_REVIEW_SUSPECT_PCT } from '../lib/adminMetrics'

const LEVEL_STYLE: Record<string, { bg: string; bd: string; tag: string; label: string }> = {
  P0: { bg: 'rgba(198,40,40,.14)', bd: '#c62828', tag: '#ff8a9a', label: '지금 확인' },
  P1: { bg: 'rgba(201,162,39,.12)', bd: '#c9a227', tag: '#ffd050', label: '살펴볼 것' },
  info: { bg: 'rgba(74,158,255,.10)', bd: '#2b4a70', tag: '#8ec3ff', label: '참고' },
}

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

/** 오늘 한눈에 — 아빠가 이 카드 하나만 보고 나가도 손해가 없어야 한다. */
export function TodayBriefing(props: {
  time: StudyTime; acc: AccuracySplit; debt: ReviewDebt; progress: ProgressView
  streak: number; todayXp: number; tips: CoachTip[]
}) {
  const { time, acc, debt, progress, tips } = props
  const goalMet = time.focusSec >= GOAL_SEC
  const tooFast = acc.reviewTotal >= FAST_REVIEW_MIN_N && (acc.reviewFastPct ?? 0) >= FAST_REVIEW_SUSPECT_PCT
  const pctOfGoal = Math.min(100, Math.round((time.focusSec / GOAL_SEC) * 100))
  return (
    <div className="adm-panel ah-brief">
      <h4>오늘 한눈에 <span className="adm-sub">문항 기록으로 다시 계산한 값입니다</span></h4>

      <div className="ah-hero">
        <div className="ah-hero-main">
          <span className="ah-hero-k">실제로 문제를 푼 시간</span>
          <span className="ah-hero-v">{time.answers === 0 ? '0분' : fmtMin(time.focusSec)}</span>
          <span className={`ah-hero-d ${goalMet ? 'ok' : ''}`}>
            {time.answers === 0
              ? '오늘 푼 문항이 없어요'
              : goalMet ? `목표 15분 달성 ✓ · ${time.answers}문항` : `목표 15분까지 ${Math.ceil((GOAL_SEC - time.focusSec) / 60)}분 · ${time.answers}문항`}
          </span>
          <span className="ah-goalbar"><i style={{ width: `${pctOfGoal}%` }} /></span>
        </div>
        <div className="ah-hero-side">
          <div className="ah-mini"><b>{fmtMin(time.openSec)}</b><span>앱이 켜져 있던 시간</span></div>
          <div className="ah-mini"><b>+{props.todayXp.toLocaleString()}</b><span>오늘 XP</span></div>
          <div className="ah-mini"><b>🔥 {props.streak}</b><span>연속 출석</span></div>
        </div>
      </div>
      {time.openSec > time.focusSec && (
        <p className="ah-note">
          켜 둔 시간({fmtMin(time.openSec)})과 푼 시간({fmtMin(time.focusSec)})은 다릅니다.
          {' '}관제실은 <b>푼 시간</b>만 학습으로 셉니다 — 켜 두기만 한 시간은 출석에도 들어가지 않아요.
          {time.devices.length > 0 && <> (오늘 기록된 기기: {time.devices.join(', ')})</>}
        </p>
      )}

      <div className="ah-split">
        <div className="ah-split-cell">
          <span className="k">🆕 신규 학습 정답률</span>
          <b className={acc.newPct === null ? '' : acc.newPct < 70 ? 'bad' : acc.newPct < 85 ? 'mid' : 'good'}>
            {acc.newPct === null ? '—' : `${acc.newPct}%`}
          </b>
          <span className="d">{acc.newCorrect}/{acc.newTotal}문항 · 실력 신호</span>
        </div>
        <div className="ah-split-cell">
          <span className="k">⛏️ 복습 정답률</span>
          {/* v1.4.40 — 정답률이 100%에 붙었는데 응답이 1초 미만이면 그건 '기억 신호'가 아니다.
              초록으로 칠하면 아빠가 칭찬으로 읽는다 — 속도를 같이 보여 주고 색을 낮춘다. */}
          <b className={
            acc.reviewPct === null ? ''
              : tooFast ? 'mid'
                : acc.reviewPct < 70 ? 'bad' : acc.reviewPct < 85 ? 'mid' : 'good'
          }>
            {acc.reviewPct === null ? '—' : `${acc.reviewPct}%`}
          </b>
          <span className="d">
            {acc.reviewCorrect}/{acc.reviewTotal}장 · {tooFast ? `⚠️ ${acc.reviewFastPct}%가 1초 미만` : '기억 신호'}
          </span>
        </div>
        <div className="ah-split-cell">
          {/* v1.4.40 — '밀린 것(기한 지남)'과 '오늘 몫'은 다른 말이다.
              예전엔 큰 글씨 "밀린 복습 116장" 바로 아래 작은 글씨 "밀린 것 없음"이 같이 떴다. */}
          <span className="k">📚 {debt.overdue > 0 ? '밀린 복습' : '오늘 복습'}</span>
          <b className={debt.overdue > 0 ? 'bad' : debt.due > 0 ? 'mid' : 'good'}>
            {debt.overdue > 0 ? debt.overdue : debt.due}장
          </b>
          <span className="d">
            {debt.overdue > 0
              ? `기한 지남 · 오늘 만기까지 ${debt.due}장`
              : debt.due > 0 ? '기한 지난 것 없음' : '오늘 캘 카드 없음'}
          </span>
        </div>
        <div className="ah-split-cell">
          <span className="k">🗺️ 진도</span>
          <b>{progress.done}/{progress.total}</b>
          <span className="d">{progress.extOpen ? `기준 ${progress.baseDone}/${progress.baseTotal} · 확장 ${progress.extDone}/${progress.extTotal}` : '기준 커리큘럼'}</span>
        </div>
      </div>

      {acc.excluded > 0 && (
        <p className="ah-note dim">
          정답률 분모에서 뺀 기록 {acc.excluded.toLocaleString()}건 — 진단·문장 발견·자기 채점(말하기)은
          {' '}맞고 틀림이 실력을 뜻하지 않아 제외합니다.
          {acc.blendedPct !== null && <> (전부 섞으면 {acc.blendedPct}%로 보입니다)</>}
        </p>
      )}

      {tips.length > 0 && (
        <div className="ah-tips">
          {tips.map((t, i) => (
            <div key={i} className="ah-tip"><span className="ah-tip-em">{t.emoji}</span><span>{t.text}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 정합성 진단 — 관제실이 자기 숫자를 의심하는 자리 */
export function IntegrityPanel(props: {
  issues: IntegrityIssue[]
  learnerId: string | null
  badgeOnlyInAdmin: string[]
  onBackfilled: (ids: string[]) => void
}) {
  const { issues } = props
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const p0 = issues.filter(i => i.level === 'P0').length
  const p1 = issues.filter(i => i.level === 'P1').length

  async function backfill() {
    const lid = props.learnerId
    const ids = props.badgeOnlyInAdmin
    if (!lid || !ids.length) return
    setBusy(true); setMsg(null)
    try {
      await db.upsert('badges', ids.map(badge_id => ({ learner_id: lid, badge_id })), 'learner_id,badge_id', true)
      props.onBackfilled(ids)
      setMsg(`${ids.length}개를 예한이 도감에 넣었어요. 앱을 다시 열면 보입니다.`)
    } catch (e) {
      setMsg(`실패했어요 (${String(e).slice(0, 80)})`)
    }
    setBusy(false)
  }

  return (
    <div className="adm-panel ah-integrity">
      <button className="ah-int-head" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <h4 style={{ margin: 0 }}>🩺 정합성 진단</h4>
        <span className="ah-int-badges">
          {p0 > 0 && <em className="p0">지금 확인 {p0}</em>}
          {p1 > 0 && <em className="p1">살펴볼 것 {p1}</em>}
          {p0 + p1 === 0 && <em className="ok">이상 없음</em>}
        </span>
        <span className="ah-int-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          <p className="adm-sub" style={{ margin: '6px 0 10px' }}>
            관제실 숫자와 예한이 앱이 보는 것이 어긋나 있는지, 기록 자체가 깨져 있지는 않은지 매 갱신마다 스스로 점검합니다.
          </p>
          {issues.length === 0 ? (
            <p className="admin-empty">어긋난 곳이 없습니다. 지금 화면의 숫자는 아이 앱과 같은 기준이에요.</p>
          ) : issues.map(is => {
            const st = LEVEL_STYLE[is.level]
            return (
              <div key={is.id} className="ah-issue" style={{ background: st.bg, borderColor: st.bd }}>
                <div className="ah-issue-head">
                  <span className="ah-issue-tag" style={{ color: st.tag, borderColor: st.tag }}>{st.label}</span>
                  <b>{is.title}</b>
                </div>
                <p className="ah-issue-detail">{is.detail}</p>
                {is.action && <p className="ah-issue-action">→ {is.action}</p>}
                {is.id === 'badge_missing_app' && props.badgeOnlyInAdmin.length > 0 && (
                  <div className="ah-issue-btns">
                    <button className="mgbtn" disabled={busy} onClick={() => void backfill()}>
                      {busy ? '넣는 중…' : `뱃지 되메우기 (${props.badgeOnlyInAdmin.length}개)`}
                    </button>
                    <span className="adm-sub">
                      {props.badgeOnlyInAdmin.map(id => BADGE_DEFS[id]?.name || id).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {msg && <p className="ah-issue-action" style={{ marginTop: 8 }}>{msg}</p>}
        </>
      )}
    </div>
  )
}
