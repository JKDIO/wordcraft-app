import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChoiceItem, MatchPair, ModuleDef, Step, StoryLine } from '../lib/content'
import { playClip, stopAudio } from '../lib/audio' // v1.4.14: tts.speak 직접 import 제거(단일 채널)
import { runeArtOf } from '../lib/runeArt'
import { QuestionCard } from './QuestionCard'
import { MatchGame } from './MatchGame'
import { OrderGame } from './OrderGame'
import { SummonExercise } from './SummonExercise'   // v1.4.24 문장 소환(모듈 내 스텝)
import { Toast, type ToastData } from './Toast'
import { XP, levelForXp, levelTitle } from '../lib/xp'
import { loadLocal } from '../lib/store'

const TOAST_MS = 2000 // 시안 10: 2초 유지, 큐 1개
const STREAK_MILESTONES = [3, 5, 7, 10]

export interface StepEvent {
  activity_type: string
  question_id: string
  question_text?: string
  given_answer?: string
  correct_answer?: string
  is_correct: boolean
  response_ms?: number
  xp: number
}

/** 모듈의 steps + boss 를 순서대로 진행하는 상태 머신 */
export function StepRunner(props: {
  mod: ModuleDef
  onEvent: (e: StepEvent) => void
  onFinish: (summary: { total: number; correct: number }) => void
}) {
  const { mod } = props
  const flat = useMemo(() => flatten(mod), [mod.module_id])
  const [idx, setIdx] = useState(0)
  const [stats, setStats] = useState({ total: 0, correct: 0 })
  const [toast, setToast] = useState<ToastData | null>(null)
  const [levelUp, setLevelUp] = useState<{ level: number; totalXp: number } | null>(null)
  const baseXp = useMemo(() => loadLocal().xp, []) // 세션 시작 시점 누적 XP (추가 네트워크 호출 없음)
  // v1.4.14: 모듈 세션을 벗어날 때(✕ 나가기·클리어) 재생 중이던 소리를 반드시 끈다
  useEffect(() => () => stopAudio(), [])
  const gainedRef = useRef(0)
  const streakRef = useRef(0)
  const toastTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const unit = flat[idx]
  const progressPct = Math.round((idx / flat.length) * 100)

  function showToast(t: ToastData) {
    clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }

  function emit(e: Omit<StepEvent, 'xp'> & { xp?: number }) {
    const xp = e.xp ?? (e.is_correct ? XP.correct : 0)
    props.onEvent({ ...e, xp })
    // v1.4.24: forge_discover는 채점 유닛이 아니라 '탐구 보상'이다 — 정답률에 섞이면 점수가 거짓이 된다(L28)
    if (e.activity_type !== 'speak' && e.activity_type !== 'game_match' && e.activity_type !== 'forge_discover') {
      setStats(s => ({ total: s.total + 1, correct: s.correct + (e.is_correct ? 1 : 0) }))
    }
    // E-1: 연속 정답 스트릭 토스트 (정오답 자체는 04 인라인 피드백이 담당)
    if (e.activity_type !== 'speak' && e.activity_type !== 'forge_discover') {
      if (e.is_correct) {
        streakRef.current += 1
        if (STREAK_MILESTONES.includes(streakRef.current)) {
          showToast({ kind: 'st', em: '🔥', title: `${streakRef.current}연속 정답!`, sub: `+${xp} XP · 만렙 각` })
        }
      } else {
        streakRef.current = 0
      }
    }
    // E-2: 레벨업 감지 (세션 내 획득 XP 누적으로 로컬 계산)
    if (xp > 0) {
      const before = levelForXp(baseXp + gainedRef.current)
      gainedRef.current += xp
      const after = levelForXp(baseXp + gainedRef.current)
      if (after > before) setLevelUp({ level: after, totalXp: baseXp + gainedRef.current })
    }
  }

  function next() {
    if (idx + 1 >= flat.length) props.onFinish(stats)
    else setIdx(idx + 1)
  }

  return (
    <div className="steprunner">
      {toast && <Toast data={toast} />}
      {/* A-1: 문항 카운트 + 진행바 + 하트 (하트 감소 로직은 별도 합의 전 — ♥5 고정 표시) */}
      <div className="quiz-top">
        <span className="q-count">{Math.min(idx + 1, flat.length)}/{flat.length}</span>
        <div className="progressbar"><div className="progressbar-fill" style={{ width: `${progressPct}%` }} /></div>
        <span className="hearts">♥♥♥♥♥</span>
      </div>
      {unit.kind === 'story' && <StoryView key={idx} lines={unit.lines} onNext={next} />}
      {unit.kind === 'learn' && <LearnView key={idx} step={unit.step} onNext={next} />}
      {unit.kind === 'question' && (
        <QuestionCard
          key={idx}
          item={unit.item}
          listen={unit.listen}
          onAnswer={r => emit({
            activity_type: unit.activity, question_id: unit.item.id, question_text: unit.item.q_ko,
            given_answer: unit.item.choices[r.givenIdx], correct_answer: unit.item.choices[unit.item.answer_idx],
            is_correct: r.correct, response_ms: r.ms,
          })}
          onNext={next}
        />
      )}
      {unit.kind === 'match' && (
        <>
          {unit.prompt && <p className="qcard-text">{unit.prompt}</p>}
          <MatchGame key={idx} pairs={unit.pairs} onDone={wrong => {
            emit({ activity_type: 'game_match', question_id: `${mod.module_id}-match-${idx}`, is_correct: wrong === 0, given_answer: `${wrong} wrong tries`, xp: XP.gameClear })
            next()
          }} />
        </>
      )}
      {unit.kind === 'order' && (
        <OrderGame key={idx} item={unit.item} onDone={(ok, ms) => emit({
          activity_type: 'game_order', question_id: unit.item.id, question_text: unit.item.prompt_ko,
          given_answer: ok ? unit.item.answer : '(오답 배열)', correct_answer: unit.item.answer, is_correct: ok, response_ms: ms,
        })} onNext={next} />
      )}
      {unit.kind === 'summon' && (
        <SummonExercise
          key={idx}
          items={unit.items}
          prompt_ko={unit.prompt}
          onAnswer={(it, ok, given, ms) => emit({
            // activity_type은 v1.4.0의 'forge'를 그대로 쓴다 — 예한이의 기존 기록·관제실 라벨과 연속(L17)
            activity_type: 'forge', question_id: it.id, question_text: it.ko,
            given_answer: given, correct_answer: it.answer, is_correct: ok, response_ms: ms,
          })}
          onDiscover={sentence => emit({
            activity_type: 'forge_discover', question_id: `DISC:${sentence.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            question_text: sentence, is_correct: true, xp: 2,
          })}
          onFinish={next}
        />
      )}
      {unit.kind === 'speak' && <SpeakView key={idx} mission={unit.mission} target={unit.target} tts={unit.tts} audio_url={unit.audio_url} onDone={() => {
        emit({ activity_type: 'speak', question_id: `${mod.module_id}-speak-${idx}`, question_text: unit.target, is_correct: true, xp: XP.speak })
        next()
      }} />}
      {unit.kind === 'bossIntro' && (
        <div className="boss-intro">
          <div className="boss-emoji">👹</div>
          <h2>{unit.title}</h2>
          <p>{unit.intro || '보스가 나타났다! 지금까지 배운 걸로 무찌르자!'}</p>
          <button className="btn primary wide" onClick={next}>⚔️ 전투 시작!</button>
        </div>
      )}
      {/* E-2: 레벨업 풀스크린 카드 (시안 10) */}
      {levelUp && (
        <div className="levelup-overlay" onClick={() => setLevelUp(null)}>
          <div className="levelup">
            <h3>LEVEL UP!</h3>
            <p className="levelup-name">LV.{levelUp.level} · {levelTitle(levelUp.level)} 🎉</p>
            <p className="levelup-xp">누적 {levelUp.totalXp.toLocaleString()} XP — GG!</p>
            <button className="btn gold wide" onClick={() => setLevelUp(null)}>좋았어, 계속 →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ----- flatten: steps → 개별 진행 유닛 -----
type Unit =
  | { kind: 'story'; lines: StoryLine[] }
  | { kind: 'learn'; step: Extract<Step, { type: 'learn' }> }
  | { kind: 'question'; item: ChoiceItem; listen: boolean; activity: string }
  | { kind: 'match'; pairs: MatchPair[]; prompt?: string }
  | { kind: 'order'; item: import('../lib/content').OrderItem }
  | { kind: 'summon'; items: import('../lib/content').SummonItem[]; prompt?: string }
  | { kind: 'speak'; mission: string; target: string; tts: string; audio_url?: string | null }
  | { kind: 'bossIntro'; title: string; intro?: string }

function flatten(mod: ModuleDef): Unit[] {
  const out: Unit[] = []
  for (const s of mod.steps) {
    if (s.type === 'story') out.push({ kind: 'story', lines: s.lines })
    else if (s.type === 'learn') out.push({ kind: 'learn', step: s })
    else if (s.type === 'quiz') for (const q of s.questions) { if (Array.isArray(q.choices) && q.choices.length) out.push({ kind: 'question', item: q, listen: isListen(q), activity: 'quiz' }) }
    else if (s.type === 'game') {
      if (s.kind === 'choice' || s.kind === 'listen_choice') {
        for (const it of s.items as ChoiceItem[]) { if (Array.isArray(it.choices) && it.choices.length) out.push({ kind: 'question', item: it, listen: s.kind === 'listen_choice', activity: `game_${s.kind}` }) }
      } else if (s.kind === 'match') {
        const raw = s.items as unknown
        const sets: { pairs: MatchPair[] }[] = Array.isArray(raw) ? raw as { pairs: MatchPair[] }[] : [raw as { pairs: MatchPair[] }]
        for (const set of sets) if (set && set.pairs) out.push({ kind: 'match', pairs: set.pairs, prompt: s.prompt_ko })
      } else if (s.kind === 'order') {
        for (const it of s.items) out.push({ kind: 'order', item: it })
      }
    } else if (s.type === 'summon') { if (s.items?.length) out.push({ kind: 'summon', items: s.items, prompt: s.prompt_ko }) }
    else if (s.type === 'speak') out.push({ kind: 'speak', mission: s.mission_ko, target: s.target_en, tts: s.tts, audio_url: s.audio_url })
  }
  if (mod.boss && mod.boss.questions?.length) {
    out.push({ kind: 'bossIntro', title: mod.boss.title_ko, intro: mod.boss.intro_ko })
    for (const q of mod.boss.questions) { if (Array.isArray(q.choices) && q.choices.length) out.push({ kind: 'question', item: q, listen: isListen(q), activity: 'boss' }) }
  }
  return out
}

function isListen(q: ChoiceItem): boolean {
  return !!q.tts && /들어|듣고|소리/.test(q.q_ko)
}

// ----- 보조 뷰 -----
function StoryView(props: { lines: StoryLine[]; onNext: () => void }) {
  const [shown, setShown] = useState(1)
  const all = props.lines.length
  return (
    <div className="story" onClick={() => (shown < all ? setShown(shown + 1) : props.onNext())}>
      {props.lines.slice(0, shown).map((l, i) => (
        <div key={i} className="story-line">
          <span className="story-emoji">{l.emoji || '💬'}</span>
          <div className="story-bubble">
            <span className="story-speaker">{l.speaker}</span>
            <p>{l.text_ko}{l.text_en ? <em className="story-en"> {l.text_en}</em> : null}</p>
          </div>
        </div>
      ))}
      <p className="tap-hint">{shown < all ? '탭해서 계속…' : '탭해서 시작! ▶'}</p>
    </div>
  )
}

function LearnView(props: { step: Extract<Step, { type: 'learn' }>; onNext: () => void }) {
  const c = props.step.card
  const art = runeArtOf(c.art_key) // v1.3.0 수정 동굴 입모양 다이어그램 (이중 부호화)
  return (
    <div className="learncard">
      <h3 className="learncard-title">📖 {c.title_ko}</h3>
      <p className="learncard-rule">{c.rule_ko}</p>
      {art && (
        <div className="mouth-art">
          <div className="mouth-art-svg" dangerouslySetInnerHTML={{ __html: art.svg }} />
          <p className="mouth-art-hint">👄 {art.hint_ko}</p>
        </div>
      )}
      <div className="learncard-examples">
        {c.examples.map((ex, i) => (
          <button key={i} className="example-chip" onClick={() => (ex.audio_url || ex.tts) && playClip(ex)}>
            <b>{ex.en}</b> <span>{ex.ko}</span> {(ex.audio_url || ex.tts) ? '🔊' : ''}
          </button>
        ))}
      </div>
      {c.tip_ko && <p className="learncard-tip">💡 {c.tip_ko}</p>}
      <button className="btn primary wide" onClick={props.onNext}>오케이, 이해했어 →</button>
    </div>
  )
}

function SpeakView(props: { mission: string; target: string; tts: string; audio_url?: string | null; onDone: () => void }) {
  const [count, setCount] = useState(0)
  return (
    <div className="speakview">
      <h3>🎤 말하기 미션</h3>
      <p className="speak-mission">{props.mission}</p>
      <button className="speak-target" onClick={() => playClip({ audio_url: props.audio_url, tts: props.tts })}>
        <span className="speak-en">{props.target}</span> 🔊
      </button>
      <button className="btn secondary wide" onClick={() => { playClip({ audio_url: props.audio_url, tts: props.tts }); setCount(c => c + 1) }}>
        따라 말했어! ({count}/3)
      </button>
      <button className="btn primary wide" disabled={count < 3} onClick={props.onDone}>
        미션 완료! +{XP.speak} XP
      </button>
    </div>
  )
}
