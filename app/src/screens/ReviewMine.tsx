import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/supabase'
import { nextDue, todayStr } from '../lib/leitner'
// v1.4.29: 카드 조회·'오늘 캔 카드' 규칙은 lib/review.ts 단일 원천 (여기서 쿼리를 직접 짜지 않는다)
import { dueCardsQuery, boxTotalsQuery, tallyBoxes, layerOf, minableCards, addReviewDone } from '../lib/review'
import { speakText, stopAudio } from '../lib/audio' // v1.4.14: 단일 오디오 채널 경유(직접 speak 금지 — L19)
import type { LocalState } from '../lib/store'
import { enqueue, recordAnswer, recordXp, bumpReviewCorrect, bumpLegendWord } from '../lib/store'
import { XP } from '../lib/xp'
import { evoOf, evoMessage } from '../lib/wordmon'

interface Card { id: number; card_id: string; card_front: string; card_back: string | null; box: number; due_date: string; review_count?: number }

// 라이트너 5층 (시안 09): 흙→돌→청금석→금→다이아
const LAYERS = [
  { name: '흙 층', cycle: '매일', desc: '새 카드·틀린 카드가 리스폰하는 곳' },
  { name: '돌 층', cycle: '2일마다', desc: '한 번 맞힌 카드' },
  { name: '청금석 층', cycle: '4일마다', desc: '제법 단단해진 기억' },
  { name: '금 층', cycle: '7일마다', desc: '거의 내 것' },
  { name: '다이아 층', cycle: '14일마다', desc: '완전 정복! 반짝반짝' },
]
const LAYER_NAMES = ['', '흙 층', '돌 층', '청금석 층', '금 층', '다이아 층']

/** 복습 카드 card_id → 답변 로그용 모듈 id (W:C6:C6-Q1-1 → C6, C6-C01 → C6) */
function moduleOfCard(cardId: string): string {
  if (cardId.startsWith('W:')) return cardId.split(':')[1] || 'REVIEW'
  const m = cardId.match(/^([A-Z]+\d+[a-z]?)-/i)
  return m ? m[1] : 'REVIEW'
}

// v1.4.4의 '오늘 맞힌 카드' 로컬 기록은 v1.4.29에서 lib/review.ts로 옮겼다 (뱃지와 화면이 같은 규칙을 쓰게).

/** 복습 광산 — 라이트너: 입구(5층 현황) → 채굴(플래시카드) → 채굴 완료 리포트
 *  v1.2.0: 기본코스와 50:50 원칙 — 카드당 +10 XP, 하루 10장 콤보마다 +20 보너스,
 *  오답 문제 전량 자동 리스폰(W: 카드), 모든 복습 답변을 answer_events로 기록(관제실 연동) */
export function ReviewMine(props: {
  state: LocalState
  onXp: (s: LocalState) => void
  backsMap: Record<string, { back: string; tts?: string | null }>
  onFinished?: () => void
}) {
  // all = 서버가 걸러 준 '오늘 due' 카드만 (v1.4.29 — 예전엔 전체 카드였다)
  const [all, setAll] = useState<Card[] | null>(null)
  // 층별 총 보유량 [_,1~5층] — 화면의 "N장" 표시 전용
  const [boxTotals, setBoxTotals] = useState<number[]>([0, 0, 0, 0, 0, 0])
  const [phase, setPhase] = useState<'entrance' | 'mining'>('entrance')
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  // v1.4.19 워드몬: 복습을 '숙제'가 아니라 '키우기'로 — 맞히면 진화 연출
  const [evoToast, setEvoToast] = useState<string | null>(null)
  const [doneCount, setDoneCount] = useState(0)
  const [comboCount, setComboCount] = useState(0)
  const [floatXp, setFloatXp] = useState<string | null>(null)
  const shownAt = useRef(0)
  const finishedRef = useRef(false)

  // v1.4.4: 입구('entrance') 진입마다 재조회(learnerId 지연 도착에도) — 채굴 후 낡은 목록 재채굴 봉합
  // ★v1.4.29 (P0)★: 이제 **서버가 due를 걸러서** 준다. 예전엔 카드 전체를 limit=500으로 받아
  //   화면에서 due를 골랐는데, 카드가 500장을 넘긴 뒤 due 카드가 창 밖으로 밀려
  //   "뱃지 40 / 광산 0"이 됐다(2026-08-14 사고). 층별 보유량은 따로 가볍게 센다.
  useEffect(() => {
    if (phase !== 'entrance') return
    const lid = props.state.learnerId
    if (!lid) { setAll([]); setBoxTotals([0, 0, 0, 0, 0, 0]); return }
    db.select('review_cards', dueCardsQuery(lid))
      .then(rows => setAll(rows as unknown as Card[]))
      .catch(() => setAll([]))
    // 층별 총 보유량 — 표시 전용이라 실패해도 채굴은 막지 않는다(0으로 남을 뿐).
    db.select('review_cards', boxTotalsQuery(lid))
      .then(rows => setBoxTotals(tallyBoxes(rows as unknown as { box: number }[])))
      .catch(() => { /* 표시 전용 */ })
  }, [phase, props.state.learnerId])

  // v1.4.14: 복습 광산을 나갈 때 플래시카드 음성이 남아 다음 화면 소리와 겹치지 않도록 정지
  useEffect(() => () => stopAudio(), [])

  const today = todayStr()
  // 서버가 due를 걸러 줬으므로 여기선 '오늘 이미 맞힌 카드'만 뺀다 — 뱃지와 같은 함수(minableCards)를 쓴다.
  const dueCards = useMemo(
    () => minableCards(all || [], today).sort((a, b) => a.box - b.box),
    [all],
  )
  // 층별(박스별) 총 보유량 + 지금 캘 수 있는 수
  const layers = useMemo(() => {
    const acc = boxTotals.map(t => ({ total: t, due: 0 }))
    for (const c of dueCards) acc[layerOf(c.box)].due++
    return acc
  }, [boxTotals, dueCards])

  // 오늘 복습 정답 수 (콤보 진행 표시)
  const todayCorrect = props.state.reviewDay?.date === today ? props.state.reviewDay.correct : 0
  const toCombo = XP.reviewComboEvery - (todayCorrect % XP.reviewComboEvery)

  if (all === null) return <div className="center-box"><p className="loading-msg">⛏️ 광산 탐색 중…</p></div>

  // ── 광산 입구 (5층 현황) ──
  if (phase === 'entrance') {
    const potential = dueCards.length * XP.reviewCorrect + Math.floor(dueCards.length / XP.reviewComboEvery) * XP.reviewCombo
    return (
      <div className="reviewmine">
        <div className="mine-head">
          <h2>복습 광산 ⛏️</h2>
          <span className="due">오늘 캘 카드 {dueCards.length}</span>
        </div>
        <div className="mine-xp-note">
          💰 카드 1장 = <b>+{XP.reviewCorrect} XP</b> (모험과 동급!) · 하루 {XP.reviewComboEvery}장마다 <b>콤보 +{XP.reviewCombo}</b>
          {dueCards.length > 0 && <> · 오늘 최대 <b>+{potential} XP</b></>}
        </div>
        {LAYERS.map((L, idx) => {
          const box = idx + 1
          const lay = layers[box]
          return (
            <div key={box} className={`wc-layer l${box} ${lay.due > 0 ? 'has-due' : ''}`}>
              <span className="ore">{box}</span>
              <span className="txt"><b>{L.name} — {L.cycle}</b><em>{L.desc}</em></span>
              <span className="cnt">{lay.total}장{lay.due > 0 ? ` · 오늘 ${lay.due}` : ''}</span>
            </div>
          )
        })}
        <button className="wc-go" disabled={dueCards.length === 0} onClick={() => { setPhase('mining'); setI(0); setDoneCount(0); setComboCount(0); finishedRef.current = false; shownAt.current = Date.now() }}>
          채굴 시작! ({dueCards.length}장) ⛏️
        </button>
        {dueCards.length === 0 && (
          <p className="tap-hint">오늘 캘 카드가 없어. 모험에서 배우거나 틀린 문제가 광산에 쌓여! 내일 다시 와봐 🌙</p>
        )}
      </div>
    )
  }

  // ── 채굴 완료 리포트 ──
  if (i >= dueCards.length) {
    if (!finishedRef.current) { finishedRef.current = true; props.onFinished?.() }
    const gained = doneCount * XP.reviewCorrect + comboCount * XP.reviewCombo
    return (
      <div className="center-box">
        <div className="diag-big">{doneCount > 0 ? '💎' : '🌙'}</div>
        <h2>{doneCount > 0 ? `광산 클리어! ${doneCount}개 채굴!` : '오늘 캘 카드가 없어'}</h2>
        {doneCount > 0 ? (
          <>
            <p className="reward-xp">+{gained} XP</p>
            <p>{comboCount > 0 ? `콤보 보너스 ${comboCount}번 포함! ㄹㅇ 광부 인정 ⛏️🔥` : '복습은 모험과 똑같이 +10씩! 내일 또 리젠돼 ⛏️'}</p>
          </>
        ) : (
          <p>모험에서 배우거나 틀린 문제가 복습 카드로 쌓여! 내일 다시 와봐 ⛏️</p>
        )}
        <button className="btn secondary wide" onClick={() => setPhase('entrance')}>광산 입구로 ⛏️</button>
      </div>
    )
  }

  const c = dueCards[i]
  const meta = props.backsMap[c.card_id]
  const back = meta?.back || c.card_back || '(뒷면 정보 없음 — 모듈에서 다시 배워보자!)'

  function grade(correct: boolean) {
    const { box, due_date } = nextDue(c.box, correct)
    enqueue({
      kind: 'update', table: 'review_cards', query: `id=eq.${c.id}`,
      payload: { box, due_date, last_result: correct, review_count: (c.review_count ?? 0) + 1, updated_at: new Date().toISOString() },  // v1.4.4
    })
    // 모든 복습 답변을 문항 로그로 기록 → 관제실 복습 지표·오늘 XP 산식과 1:1 연동 (CONTRACT §2)
    recordAnswer(props.state, {
      module_id: moduleOfCard(c.card_id), activity_type: 'review', question_id: c.card_id,
      question_text: c.card_front, given_answer: correct ? '알아! 😎' : '헷갈려 🤔', correct_answer: back,
      is_correct: correct, response_ms: shownAt.current ? Date.now() - shownAt.current : undefined,
    })
    if (correct) {
      addReviewDone(c.card_id)  // v1.4.4: 오늘 맞힌 카드 = 재채굴 차단
      const bumped = bumpReviewCorrect(props.state, XP.reviewComboEvery)
      let s = recordXp(bumped.s, XP.reviewCorrect, 'review_correct')
      if (bumped.comboHit) {
        s = recordXp(s, XP.reviewCombo, 'review_combo')
        setComboCount(n => n + 1)
        setFloatXp(`콤보! +${XP.reviewCorrect + XP.reviewCombo} XP`)
      } else {
        setFloatXp(`+${XP.reviewCorrect} XP`)
      }
      // v1.4.21 — 👑전설(박스 5)에 도달한 어휘 워드몬을 세어 둔다(뱃지 wordmon_legend_*).
      //   서버 review_cards만 봐도 알 수 있지만, 앱이 매번 전량 조회할 수는 없으므로 로컬에 누적한다.
      if (box >= 5 && c.card_id.startsWith('vocab:')) s = bumpLegendWord(s, c.card_id)
      props.onXp(s)
      setDoneCount(d => d + 1)
      setTimeout(() => setFloatXp(null), 1400)
    } else {
      props.onXp(bumpKeep(props.state)) // 오답 — 상태 저장만 (박스1 리스폰)
    }
    // v1.4.19 진화 연출 — box는 라이트너 규칙 그대로, 보여주는 방식만 바뀐다
    setEvoToast(evoMessage(c.box, box))
    setTimeout(() => setEvoToast(null), 1700)
    setFlipped(false)
    setI(i + 1)
    shownAt.current = Date.now() // 다음 카드 응답시간 기준점
  }

  return (
    <div className="reviewmine">
      <p className="review-progress">
        ⛏️ {i + 1} / {dueCards.length}
        <EvoChip box={c.box} respawn={c.card_id.startsWith('W:')} />
      </p>
      <p className="combo-meter">🔥 콤보까지 {toCombo}장 <em>(오늘 {todayCorrect}장 채굴)</em></p>
      <button className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => { setFlipped(true); if (meta?.tts) speakText(meta.tts!) }}>
        {!flipped ? (
          <><p className="flash-front">{c.card_front}</p><p className="tap-hint">카드를 탭해서 뒤집기 👆</p></>
        ) : (
          <p className="flash-back">{back}</p>
        )}
        {floatXp && <span className="float-xp">{floatXp}</span>}
      </button>
      {flipped && (
        <div className="grade-row">
          <button className="btn correct-btn" onClick={() => grade(true)}>알아! 😎</button>
          <button className="btn wrong-btn" onClick={() => grade(false)}>헷갈려 🤔</button>
        </div>
      )}
      {evoToast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
          background: '#0f1a28', border: '2px solid #3ddc84', borderRadius: 14,
          padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#eaf1fa',
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', zIndex: 50, maxWidth: '90vw', textAlign: 'center',
        }}>{evoToast}</div>
      )}
    </div>
  )
}

/** v1.4.19 — 라이트너 박스를 '진화 단계'로 보여준다. 다음 진화까지의 간격도 함께(왜 지금 만나는지 이해). */
function EvoChip(props: { box: number; respawn?: boolean }) {
  const e = evoOf(props.box)
  return (
    <span className="box-chip" style={{ borderColor: e.color, color: e.color }}>
      {e.emoji} {e.name}
      <span style={{ opacity: .65, marginLeft: 6, fontWeight: 400 }}>{e.stage}/5</span>
      {props.respawn && <span style={{ opacity: .7, marginLeft: 6 }}>· 리스폰 몹 👾</span>}
    </span>
  )
}

/** 오답 시에도 최신 상태 반환 (별도 변경 없음 — setState 일관성용) */
function bumpKeep(s: LocalState): LocalState { return s }
