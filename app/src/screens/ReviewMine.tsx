import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/supabase'
import { nextDue, todayStr } from '../lib/leitner'
// v1.4.29: 카드 조회·'오늘 캔 카드' 규칙은 lib/review.ts 단일 원천 (여기서 쿼리를 직접 짜지 않는다)
import {
  dueCardsQuery, boxTotalsQuery, tallyBoxes, layerOf, minableCards, todaysMine, addReviewDone,
  addGradedToday, gradeSwapped, DAILY_MINE_CAP, MIN_REVEAL_MS,
} from '../lib/review'
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
  // ★v1.4.43 (C4)★ 조회 실패 상태 — '카드 없음'과 절대 같은 화면을 쓰지 않는다.
  const [loadError, setLoadError] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
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
  const gradingRef = useRef(-1)   // ★v1.4.43★ 이번 카드(index)를 이미 채점했는가 — 더블탭 방어
  const reqRef = useRef(0)        // ★v1.4.43★ 최신 조회 요청 번호 (재시도 경합 방어)
  // ★v1.4.40★ 뒷면을 볼 시간도 없는 채점을 막는 게이트 (review.ts MIN_REVEAL_MS)
  const [canGrade, setCanGrade] = useState(false)
  // ★v1.4.40★ '알아!'와 '헷갈려'의 좌우를 카드마다 섞는다 — 위치를 외워 연타하는 것을 막는다.
  //   실행마다 다른 씨앗 + 카드 index로 정해, 같은 카드를 보는 동안에는 절대 안 흔들린다.
  const shuffleSeed = useRef(Math.floor(Math.random() * 1e9))

  // v1.4.4: 입구('entrance') 진입마다 재조회(learnerId 지연 도착에도) — 채굴 후 낡은 목록 재채굴 봉합
  // ★v1.4.29 (P0)★: 이제 **서버가 due를 걸러서** 준다. 예전엔 카드 전체를 limit=500으로 받아
  //   화면에서 due를 골랐는데, 카드가 500장을 넘긴 뒤 due 카드가 창 밖으로 밀려
  //   "뱃지 40 / 광산 0"이 됐다(2026-08-14 사고). 층별 보유량은 따로 가볍게 센다.
  useEffect(() => {
    if (phase !== 'entrance') return
    reqRef.current = reloadTick
    const lid = props.state.learnerId
    if (!lid) { setAll([]); setBoxTotals([0, 0, 0, 0, 0, 0]); return }
    // ★v1.4.38★ `db.select`가 아니라 `db.selectAll`. 서버(Supabase Data API)는 `Max rows`가 1,000이라
    //   쿼리에 limit=2000/20000을 적어도 **1,000행에서 조용히 자른다.**
    //   예한이 카드는 이미 687장이다 — 1,000장을 넘는 순간 v1.4.29의 절단 사고가 그대로 재현된다
    //   ("뱃지엔 40인데 광산은 0"). 그때는 창(window)이 문제였고, 이번엔 서버 상한이다. 원인만 다르고 증상은 같다.
    // ★v1.4.43 (C4)★ 조회 실패를 빈 목록으로 삼키지 않는다.
    //   예전엔 `.catch(() => setAll([]))` 였고, 그 결과 오프라인에서 화면이
    //   「오늘 캘 카드가 없어. 내일 다시 와봐 🌙」라고 말했다 — 실제로는 오늘 만기 96장·기한 지남 62장이었다.
    //   BadgeLoadout.tsx가 이미 적어 둔 원칙 그대로: **조용한 폴백은 조용한 유실과 같다.**
    setLoadError(false)
    // ★v1.4.43★ '다시 시도'를 연타하면 늦게 온 옛 응답이 새 결과를 덮을 수 있다 — 최신 요청만 반영한다.
    const myTick = reloadTick
    db.selectAll('review_cards', dueCardsQuery(lid))
      .then(r => { if (myTick !== reqRef.current) return; setAll(r.rows as unknown as Card[]); setLoadError(false) })
      .catch(() => { if (myTick !== reqRef.current) return; setAll(null); setLoadError(true) })
    // 층별 총 보유량 — 표시 전용이라 실패해도 채굴은 막지 않는다(0으로 남을 뿐).
    db.selectAll('review_cards', boxTotalsQuery(lid))
      .then(r => setBoxTotals(tallyBoxes(r.rows as unknown as { box: number }[])))
      .catch(() => { /* 표시 전용 */ })
  }, [phase, props.state.learnerId, reloadTick])

  // v1.4.14: 복습 광산을 나갈 때 플래시카드 음성이 남아 다음 화면 소리와 겹치지 않도록 정지
  useEffect(() => () => stopAudio(), [])

  const today = todayStr()
  // 서버가 due를 걸러 줬으므로 여기선 '오늘 이미 맞힌 카드'만 뺀다 — 뱃지와 같은 함수를 쓴다.
  //   ★v1.4.40★ dueCards = **오늘의 몫**(상한 60장). 하단 네비 뱃지도 같은 `todaysMine`을 쓴다.
  //   waiting = 오늘 몫에 못 들어간 나머지. 사라지는 게 아니라 내일 다시 온다.
  const dueCards = useMemo(() => todaysMine(all || [], today), [all])
  const allMinable = useMemo(() => minableCards(all || [], today), [all])
  const waiting = Math.max(0, allMinable.length - dueCards.length)
  // 층별(박스별) 총 보유량 + 오늘 몫에 들어간 수
  const layers = useMemo(() => {
    const acc = boxTotals.map(t => ({ total: t, due: 0 }))
    for (const c of dueCards) acc[layerOf(c.box)].due++
    return acc
  }, [boxTotals, dueCards])

  // ★v1.4.43 (N2)★ 카드가 화면에 뜨는 순간 앞면 음성을 한 번 자동 재생한다(뒤집기 전).
  //   W:CMD/W:ECHO 카드는 앞면 한국어가 범용 문구라, 소리 없이는 문제 자체가 존재하지 않는다.
  useEffect(() => {
    if (phase !== 'mining' || flipped) return
    const card = dueCards[i]
    const tts = card ? props.backsMap[card.card_id]?.tts : null
    if (tts) speakText(tts)
    // flipped 제외: 가드(위)가 이미 뒤집힌 상태를 걸러낸다. 뒤집을 때 다시 트는 호출은
    //   v1.4.43에서 제거했다 — 앞면 자동재생을 아이가 듣는 도중에 끊고 처음부터 되감기 때문.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i])

  // 뒤집은 뒤 MIN_REVEAL_MS 가 지나야 채점 버튼이 열린다. 카드가 바뀌면 다시 닫힌다.
  useEffect(() => {
    if (!flipped) { setCanGrade(false); return }
    setCanGrade(false)
    const t = setTimeout(() => setCanGrade(true), MIN_REVEAL_MS)
    return () => clearTimeout(t)
  }, [flipped, i])

  // 오늘 복습 정답 수 (콤보 진행 표시)
  const todayCorrect = props.state.reviewDay?.date === today ? props.state.reviewDay.correct : 0
  const toCombo = XP.reviewComboEvery - (todayCorrect % XP.reviewComboEvery)

  // ★v1.4.43 (C4)★ 조회 실패 화면 — 원인을 말하고 다시 시도할 수단을 준다.
  if (loadError) {
    return (
      <div className="reviewmine">
        <div className="mine-head"><h2>복습 광산 ⛏️</h2></div>
        <div className="center-box mine-loaderr">
          <p>📡 광산이랑 연결이 안 됐어. <b>오늘 캘 카드가 없는 게 아니라, 아직 못 불러온 거야.</b></p>
          <p className="tap-hint">와이파이나 데이터가 켜져 있는지 보고 다시 눌러줘!</p>
          <button className="btn primary wide" onClick={() => { setLoadError(false); setAll(null); setReloadTick(t => t + 1) }}>
            다시 시도 🔄
          </button>
        </div>
      </div>
    )
  }
  if (all === null) return <div className="center-box"><p className="loading-msg">⛏️ 광산 탐색 중…</p></div>

  // ── 광산 입구 (5층 현황) ──
  if (phase === 'entrance') {
    const potential = dueCards.length * XP.reviewCorrect + Math.floor(dueCards.length / XP.reviewComboEvery) * XP.reviewCombo
    return (
      <div className="reviewmine">
        <div className="mine-head">
          <h2>복습 광산 ⛏️</h2>
          <span className="due">오늘 몫 {dueCards.length}장</span>
        </div>
        <div className="mine-xp-note">
          💰 카드 1장 = <b>+{XP.reviewCorrect} XP</b> (모험과 동급!) · {XP.reviewComboEvery}장마다 <b>콤보 +{XP.reviewCombo}</b>
          {dueCards.length > 0 && <> · 오늘 몫 다 캐면 <b>+{potential} XP</b></>}
        </div>
        {waiting > 0 && dueCards.length > 0 && (
          <p className="mine-waiting">
            ⛰️ 광맥에 <b>{waiting}장</b>이 더 묻혀 있어. 하루에 <b>{DAILY_MINE_CAP}장</b>까지만 캐는 게 규칙이야 —
            한 번에 다 캐면 기억에 안 남거든. 나머지는 <b>내일 그대로</b> 기다리고 있어 😎
          </p>
        )}
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
          <p className="tap-hint">
            {allMinable.length === 0
              ? '오늘 캘 카드가 없어. 모험에서 배우거나 틀린 문제가 광산에 쌓여! 내일 다시 와봐 🌙'
              : `오늘 몫은 다 캤어! 🎉 남은 ${allMinable.length}장은 내일 리젠돼. 오늘은 모험하러 갈까? 🗺️`}
          </p>
        )}
      </div>
    )
  }

  // ── 채굴 완료 리포트 ──
  // v1.4.40-b — `doneCount`는 **맞힌 수**다. 60장을 전부 정직하게 "헷갈려"로 답한 아이는
  //   doneCount=0이라 예전 문구로는 "🌙 오늘 캘 카드가 없어"를 보고, 바로 다음 입구에서
  //   "오늘 몫 60장"을 봤다 — 정직하게 답한 아이만 모순을 만났다(독립 감사 지적).
  const attempted = i > 0
  if (i >= dueCards.length) {
    if (!finishedRef.current) { finishedRef.current = true; props.onFinished?.() }
    const gained = doneCount * XP.reviewCorrect + comboCount * XP.reviewCombo
    return (
      <div className="center-box">
        <div className="diag-big">{doneCount > 0 ? '💎' : attempted ? '⛏️' : '🌙'}</div>
        <h2>{doneCount > 0 ? `오늘 몫 끝! ${doneCount}개 채굴 💎` : attempted ? '오늘 몫 끝! 전부 다시 광산으로 ⛏️' : '오늘 캘 카드가 없어'}</h2>
        {doneCount === 0 && attempted ? (
          <>
            <p>헷갈린다고 솔직하게 누른 카드는 <b>전부 흙 층(박스1)으로 리스폰</b>됐어. 그게 진짜 복습이야 —
              모르는 걸 아는 척 넘기는 것보다 백 배 낫다 😎</p>
            <p className="tap-hint">내일 이 카드들을 다시 만나. 그때 하나씩 캐면 돼 ⛏️</p>
          </>
        ) : doneCount > 0 ? (
          <>
            <p className="reward-xp">+{gained} XP</p>
            <p>{comboCount > 0 ? `콤보 보너스 ${comboCount}번 포함! ㄹㅇ 광부 인정 ⛏️🔥` : '복습은 모험과 똑같이 +10씩! ⛏️'}</p>
            <p className="tap-hint">
              {waiting > 0
                ? `광맥에 ${waiting}장이 남아 있지만 오늘은 여기까지! 내일 이 자리에 그대로 있어 — 하루씩 나눠 캐야 진짜 내 것이 돼 😎`
                : '광맥을 오늘치까지 싹 비웠어! 이제 모험 갈 시간 🗺️'}
            </p>
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
    // ★v1.4.43★ 더블탭 방어. C6 이후 addGradedToday()가 상한의 분모라, 한 번 누른 것이 두 번 세지면
    //   아이가 30장만 봤는데 60장을 쓴 것이 된다. answer_events 중복 기록도 함께 막는다(무삭제 테이블).
    if (gradingRef.current === i) return
    gradingRef.current = i
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
    // ★v1.4.43 (C6)★ 상한의 분모는 정·오답 **양쪽**을 센다. 여기가 빠지면 오답이 상한을 소모하지 않아
    //   「헷갈려」를 누를수록 오늘 몫이 늘어나던 그 구조가 그대로 돌아온다.
    addGradedToday()
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
    gradingRef.current = -1      // 다음 카드는 다시 채점 가능
    shownAt.current = Date.now() // 다음 카드 응답시간 기준점
  }

  return (
    <div className="reviewmine">
      <p className="review-progress">
        ⛏️ {i + 1} / {dueCards.length}
        <EvoChip box={c.box} respawn={c.card_id.startsWith('W:')} />
      </p>
      <p className="combo-meter">🔥 콤보까지 {toCombo}장 <em>(오늘 {todayCorrect}장 채굴)</em></p>
      <button className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)}>
        {!flipped ? (
          <>
            <p className="flash-front">{c.card_front}</p>
            {/* ★v1.4.43 (N2)★ 소리를 뒤집기 **전에** 들려준다.
                예전엔 speakText가 뒤집기 핸들러 안에만 있어서, 지령·에코 카드처럼
                앞면이 「본부에서 긴급 지령! 잘 들어봐」 같은 범용 문구인 카드는
                무엇을 떠올려야 할지 알 수 없었다(같은 앞면 4장의 답이 각각 달랐다).
                인출 연습은 문제를 만난 뒤에야 성립한다. */}
            {meta?.tts && (
              <span
                role="button" tabIndex={0} className="flash-listen"
                onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); speakText(meta.tts!) }}
                onKeyDown={(e: { key: string; stopPropagation: () => void }) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); speakText(meta.tts!) }
                }}
              >🔊 다시 듣기</span>
            )}
            <p className="tap-hint">카드를 탭해서 뒤집기 👆</p>
          </>
        ) : (
          <p className="flash-back">{back}</p>
        )}
        {floatXp && <span className="float-xp">{floatXp}</span>}
      </button>
      {/* ★v1.4.40★ 뒤집자마자 채점하는 것을 막는다.
          뒷면을 볼 시간(MIN_REVEAL_MS)이 지나야 버튼이 열리고, 좌우 위치도 카드마다 바뀐다.
          (2026-08-16 실측: 복습 응답시간 중앙값 246ms — 뒷면을 읽고 낸 답이 아니었다) */}
      {flipped && !canGrade && (
        <div className="grade-row grade-wait" aria-live="polite">
          <span className="grade-reading">👀 뒷면 읽는 중…</span>
        </div>
      )}
      {flipped && canGrade && (
        <div className="grade-row">
          {(gradeSwapped(i, shuffleSeed.current)
            ? [
              <button key="w" className="btn wrong-btn" onClick={() => grade(false)}>헷갈려 🤔</button>,
              <button key="c" className="btn correct-btn" onClick={() => grade(true)}>알아! 😎</button>,
            ]
            : [
              <button key="c" className="btn correct-btn" onClick={() => grade(true)}>알아! 😎</button>,
              <button key="w" className="btn wrong-btn" onClick={() => grade(false)}>헷갈려 🤔</button>,
            ])}
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
